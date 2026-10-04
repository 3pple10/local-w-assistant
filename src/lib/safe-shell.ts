// Safe Shell engine: parses ONE plain command, checks it against the real
// filesystem, and scores how safe it is. Only a small allow-list of commands is
// understood, and execution never goes through a shell — each command maps to a
// single, explicit file operation.

export type Kind = "file" | "dir" | null | "unknown";
export interface Entry {
  name: string;
  kind: "file" | "dir";
}
export type OpName = "ls" | "pwd" | "cd" | "cat" | "mkdir" | "touch" | "rm" | "mv" | "cp";
export interface Op {
  cmd: OpName;
  paths: string[];
  recursive?: boolean;
  parents?: boolean;
}
export interface ShellFs {
  mode: "desktop" | "sandbox";
  home: string;
  stat(paths: string[]): Promise<Record<string, Kind>>;
  list(dir: string): Promise<Entry[]>;
  exec(op: Op): Promise<string>;
}

export type Level = "safe" | "destructive" | "uncertain" | "critical";
export interface Issue {
  level: Level | "info";
  text: string;
}
export type Visual =
  | { type: "view"; dir: string }
  | { type: "create"; parent: string; names: string[]; kind: "file" | "dir"; broken?: boolean }
  | { type: "delete"; parent: string; names: string[] }
  | {
      type: "transfer";
      mode: "move" | "copy" | "rename";
      fromDir: string;
      name: string;
      toDir: string;
      toName: string;
      broken: boolean;
      note?: string;
    };
export interface Verdict {
  score: number;
  level: Level;
  issues: Issue[];
  visual: Visual | null;
  op?: Op;
  locked: boolean;
  summary: string;
}

export const SUPPORTED: OpName[] = ["ls", "pwd", "cd", "cat", "mkdir", "touch", "rm", "mv", "cp"];
const FLAGS: Record<OpName, string[]> = {
  ls: ["a", "l"],
  pwd: [],
  cd: [],
  cat: [],
  mkdir: ["p"],
  touch: [],
  rm: ["r", "R", "f"],
  mv: [],
  cp: ["r", "R"],
};

/* ---------------- paths ---------------- */

export function normalize(p: string): string {
  const parts: string[] = [];
  for (const s of p.split("/")) {
    if (!s || s === ".") continue;
    if (s === "..") parts.pop();
    else parts.push(s);
  }
  return "/" + parts.join("/");
}
export function resolvePath(cwd: string, home: string, p: string): string {
  if (p === "~" || p.startsWith("~/")) p = home + p.slice(1);
  return normalize(p.startsWith("/") ? p : `${cwd}/${p}`);
}
export const dirname = (p: string) => (p === "/" ? "/" : normalize(`${p}/..`));
export const basename = (p: string) => p.split("/").filter(Boolean).pop() ?? "/";
export const pretty = (home: string, p: string) =>
  p === home ? "~" : p.startsWith(home + "/") ? "~" + p.slice(home.length) : p;

/* ---------------- tokenizer ---------------- */

interface Tok {
  v: string;
  quoted: boolean;
  trailingSlash: boolean;
}

export function tokenize(s: string) {
  const tokens: Tok[] = [];
  let cur = "";
  let q: string | null = null;
  let quoted = false;
  let has = false;
  let blocked: string | null = null;
  let glob = false;
  const push = () => {
    if (has) tokens.push({ v: cur, quoted, trailingSlash: cur.length > 1 && cur.endsWith("/") });
    cur = "";
    has = false;
    quoted = false;
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === q) q = null;
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      q = c;
      quoted = true;
      has = true;
      continue;
    }
    if (c === "\\" && i + 1 < s.length) {
      cur += s[++i];
      quoted = true;
      has = true;
      continue;
    }
    if (/\s/.test(c)) {
      push();
      continue;
    }
    if (/[;&|`$<>]/.test(c)) blocked ??= c;
    if (/[*?[\]{}]/.test(c)) glob = true;
    cur += c;
    has = true;
  }
  push();
  return { tokens, unclosed: q !== null, blocked, glob };
}

/* ---------------- analysis ---------------- */

function levelOf(score: number): Level {
  if (score >= 100) return "safe";
  if (score >= 85) return "destructive";
  if (score >= 70) return "uncertain";
  return "critical";
}

export async function analyze(
  input: string,
  cwd: string,
  home: string,
  stat: ShellFs["stat"],
): Promise<Verdict | null> {
  const text = input.trim();
  if (!text) return null;

  const issues: Issue[] = [];
  let cap = 100;
  const note = (level: Issue["level"], score: number, msg: string) => {
    issues.push({ level, text: msg });
    cap = Math.min(cap, score);
  };
  const finish = (visual: Visual | null, op: Op | undefined, summary: string): Verdict => {
    const level = levelOf(cap);
    return { score: cap, level, issues, visual, op: cap < 70 ? undefined : op, locked: cap < 70, summary };
  };
  const fail = (score: number, msg: string, visual: Visual | null = null) => {
    note("critical", score, msg);
    return finish(visual, undefined, "Blocked");
  };

  const t = tokenize(text);
  if (t.unclosed) return fail(30, "A quote is never closed — the command would not end where you think.");
  if (t.blocked)
    return fail(
      15,
      `“${t.blocked}” is blocked. Chaining, pipes, redirection and variables are never run here — one plain command at a time.`,
    );
  if (t.glob)
    return fail(30, "Wildcards (*, ?, [ ], { }) are blocked — they can match far more than you expect. Name each file explicitly.");

  const [head, ...rest] = t.tokens;
  const cmd = head.v as OpName;
  if (head.v === "sudo") return fail(5, "sudo is never run from here — it would give the command full control of your computer.");
  if (!SUPPORTED.includes(cmd))
    return fail(50, `“${head.v}” isn't a supported command. Supported: ${SUPPORTED.join(", ")}.`);

  const flags = new Set<string>();
  const args: Tok[] = [];
  for (const tk of rest) {
    if (!tk.quoted && tk.v.startsWith("-") && tk.v.length > 1) {
      for (const ch of tk.v.slice(1)) {
        if (!FLAGS[cmd].includes(ch)) return fail(55, `Unknown option “-${ch}” for ${cmd}.`);
        flags.add(ch.toLowerCase());
      }
    } else args.push(tk);
  }

  // Beginner typo: a space before an extension ("rm file .txt").
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    const prev = args[i - 1];
    if (!a.quoted && /^\.[A-Za-z0-9]{1,6}$/.test(a.v) && !prev.trailingSlash) {
      return fail(
        35,
        `Stray space before “${a.v}”: this targets “${prev.v}” AND a separate file called “${a.v}”. Did you mean “${prev.v}${a.v}”? If you really mean a file named “${a.v}”, put it in quotes.`,
      );
    }
  }

  const abs = args.map((a) => resolvePath(cwd, home, a.v));
  const need = new Set<string>([cwd]);
  abs.forEach((p) => {
    need.add(p);
    need.add(dirname(p));
  });
  const st = await stat([...need]);
  const kind = (p: string): Kind => (p in st ? st[p] : "unknown");
  const P = (p: string) => pretty(home, p);

  const arity = (min: number, max: number, usage: string) => {
    if (args.length < min || args.length > max) {
      const extra =
        args.length > max
          ? " If a name has spaces in it, wrap it in quotes, e.g. \"my file.txt\"."
          : "";
      note("critical", 50, `Usage: ${usage}.${extra}`);
      return false;
    }
    return true;
  };
  const isProtected = (p: string) =>
    p === "/" || p === home || home.startsWith(p + "/") || p.split("/").filter(Boolean).length < 2;
  const mustExist = (p: string, want?: "file" | "dir"): boolean => {
    const k = kind(p);
    if (k === "unknown") {
      note("uncertain", 78, `Can't confirm that ${P(p)} exists.`);
      return true;
    }
    if (k === null) {
      note("critical", 45, `${P(p)} doesn't exist.`);
      return false;
    }
    if (want && k !== want) {
      note("critical", 50, `${P(p)} is a ${k === "dir" ? "folder" : "file"}, not a ${want === "dir" ? "folder" : "file"}.`);
      return false;
    }
    return true;
  };

  switch (cmd) {
    case "pwd":
      if (!arity(0, 0, "pwd")) return finish(null, undefined, "Blocked");
      return finish({ type: "view", dir: cwd }, { cmd, paths: [cwd] }, `Shows the current folder: ${P(cwd)}`);

    case "ls": {
      if (!arity(0, 1, "ls [folder]")) return finish(null, undefined, "Blocked");
      const target = abs[0] ?? cwd;
      mustExist(target);
      const dir = kind(target) === "file" ? dirname(target) : target;
      return finish({ type: "view", dir }, { cmd, paths: [target] }, `Lists ${P(target)} — read-only`);
    }

    case "cd": {
      if (!arity(0, 1, "cd <folder>")) return finish(null, undefined, "Blocked");
      const target = abs[0] ?? home;
      mustExist(target, "dir");
      return finish({ type: "view", dir: target }, { cmd, paths: [target] }, `Moves you into ${P(target)}`);
    }

    case "cat": {
      if (!arity(1, 1, "cat <file>")) return finish(null, undefined, "Blocked");
      mustExist(abs[0], "file");
      return finish({ type: "view", dir: dirname(abs[0]) }, { cmd, paths: abs }, `Shows the contents of ${P(abs[0])} — read-only`);
    }

    case "mkdir":
    case "touch": {
      if (!arity(1, 20, `${cmd} <name> [more names]`)) return finish(null, undefined, "Blocked");
      const parent = dirname(abs[0]);
      if (abs.some((p) => dirname(p) !== parent)) {
        note("critical", 60, "Keep every new item in the same folder for one command.");
        return finish(null, undefined, "Blocked");
      }
      const isDir = cmd === "mkdir";
      const pk = kind(parent);
      let broken = false;
      if (pk === "unknown") note("uncertain", 78, `Can't confirm the folder ${P(parent)} exists.`);
      else if (pk === null && !(isDir && flags.has("p"))) {
        note("critical", 50, `The folder ${P(parent)} doesn't exist${isDir ? " — add -p to create it too" : ""}.`);
        broken = true;
      } else if (pk === "file") {
        note("critical", 45, `${P(parent)} is a file, so nothing can be created inside it.`);
        broken = true;
      }
      for (const p of abs) {
        const k = kind(p);
        if (isDir && k !== null && k !== "unknown") note("critical", 55, `${P(p)} already exists.`);
        if (!isDir && k === "dir") note("critical", 55, `${P(p)} is a folder.`);
        if (!isDir && k === "file") note("info", 100, `${P(p)} already exists — only its "last modified" time changes.`);
      }
      const names = abs.map(basename);
      return finish(
        { type: "create", parent, names, kind: isDir ? "dir" : "file", broken },
        { cmd, paths: abs, parents: flags.has("p") },
        `Creates ${isDir ? "folder" : "file"}${names.length > 1 ? "s" : ""} ${names.join(", ")} in ${P(parent)}`,
      );
    }

    case "rm": {
      if (!arity(1, 20, "rm <file> [more files]")) return finish(null, undefined, "Blocked");
      const parent = dirname(abs[0]);
      for (const p of abs) {
        if (isProtected(p)) {
          note("critical", 5, `Refusing to delete ${P(p)} — it's a system root or your home folder.`);
          continue;
        }
        if (args[abs.indexOf(p)].v === "." || args[abs.indexOf(p)].v.endsWith("..")) {
          note("critical", 10, "Deleting . or .. would remove the folder you are standing in.");
          continue;
        }
        if (!mustExist(p)) continue;
        if (kind(p) === "dir" && !flags.has("r"))
          note("critical", 55, `${P(p)} is a folder. Add -r to delete a folder and everything inside it.`);
      }
      const recursive = flags.has("r");
      note("destructive", recursive ? 86 : 90, recursive ? "Deletes folders and everything inside them." : "Deletes files.");
      return finish(
        { type: "delete", parent, names: abs.map(basename) },
        { cmd, paths: abs, recursive },
        `Removes ${abs.map(basename).join(", ")}`,
      );
    }

    case "mv":
    case "cp": {
      if (!arity(2, 2, `${cmd} <source> <destination>`)) return finish(null, undefined, "Blocked");
      const [src, dst] = abs;
      const dstTok = args[1];
      const copy = cmd === "cp";
      if (!copy && isProtected(src)) {
        note("critical", 5, `Refusing to move ${P(src)} — it's a system root or your home folder.`);
        return finish(null, undefined, "Blocked");
      }
      mustExist(src);
      if (copy && kind(src) === "dir" && !flags.has("r"))
        note("critical", 55, `${P(src)} is a folder. Add -r to copy a folder.`);
      if (dst === src || dst.startsWith(src + "/")) {
        note("critical", 40, "The destination is the source itself or inside it.");
        return finish(null, undefined, "Blocked");
      }

      const dk = kind(dst);
      let toDir = dirname(dst);
      let toName = basename(dst);
      let mode: "move" | "copy" | "rename" = copy ? "copy" : "move";
      let broken = false;
      let bubble: string | undefined;

      if (dk === "dir") {
        toDir = dst;
        toName = basename(src);
        const final = `${dst}/${toName}`;
        const fk = (await stat([final]))[final];
        if (fk === "dir") note("critical", 50, `${P(final)} already exists as a folder.`);
        else if (fk === "file") note("destructive", 86, `Replaces the existing ${P(final)} (the old one goes to the Trash).`);
        else if (fk === "unknown") note("uncertain", 78, `Can't confirm whether ${P(final)} already exists.`);
      } else if (dk === "file") {
        note("destructive", 86, `Replaces the existing ${P(dst)} (the old one goes to the Trash).`);
      } else if (dk === null) {
        const parentKind = kind(toDir);
        if (dstTok.trailingSlash || parentKind === null) {
          broken = true;
          bubble = dstTok.trailingSlash
            ? "This folder doesn't exist. The command would fail — create it first with mkdir."
            : `The folder ${P(toDir)} doesn't exist.`;
          note("critical", 40, bubble);
        } else if (!copy && !toName.includes(".") && basename(src).includes(".")) {
          broken = true;
          bubble =
            "This path doesn't exist. This command will accidentally rename your file instead of moving it.";
          note("critical", 45, `${bubble} Add a trailing “/” if you meant a folder, or create it first.`);
        } else if (!copy && toDir === dirname(src)) {
          mode = "rename";
        }
      } else {
        note("uncertain", 78, `Can't confirm the destination ${P(dst)}.`);
      }

      if (!copy && !broken) note("destructive", mode === "rename" ? 95 : 94, mode === "rename" ? "Renames the item." : "Moves the item out of its current folder.");
      const final = `${toDir}/${toName}`.replace(/\/+/g, "/");
      return finish(
        { type: "transfer", mode, fromDir: dirname(src), name: basename(src), toDir, toName, broken, note: bubble },
        { cmd, paths: [src, final], recursive: flags.has("r") },
        `${mode === "copy" ? "Copies" : mode === "rename" ? "Renames" : "Moves"} ${basename(src)} → ${P(final)}`,
      );
    }
  }
}

/* ---------------- in-browser sandbox ---------------- */

type Node = { kind: "dir"; children: Map<string, Node> } | { kind: "file"; content: string };

export function createSandboxFs(): ShellFs {
  const home = "/Users/you";
  const dir = (entries: Record<string, Node>): Node => ({ kind: "dir", children: new Map(Object.entries(entries)) });
  const file = (content = ""): Node => ({ kind: "file", content });
  const root = dir({
    Users: dir({
      you: dir({
        Desktop: dir({ "todo.txt": file("buy milk\n") }),
        Documents: dir({ "report.pdf": file("%PDF"), "notes.md": file("# Notes\n") }),
        Downloads: dir({}),
        "doc.txt": file("Hello from the sandbox.\n"),
      }),
    }),
  });
  const get = (p: string): Node | null => {
    let n: Node = root;
    for (const part of p.split("/").filter(Boolean)) {
      if (n.kind !== "dir") return null;
      const next = n.children.get(part);
      if (!next) return null;
      n = next;
    }
    return n;
  };
  const parentOf = (p: string) => {
    const n = get(dirname(p));
    if (!n || n.kind !== "dir") throw new Error(`${dirname(p)} doesn't exist`);
    return n;
  };
  const clone = (n: Node): Node =>
    n.kind === "file" ? { ...n } : { kind: "dir", children: new Map([...n.children].map(([k, v]) => [k, clone(v)])) };
  return {
    mode: "sandbox",
    home,
    async stat(paths) {
      const out: Record<string, Kind> = {};
      for (const p of paths) out[p] = get(p)?.kind ?? null;
      return out;
    },
    async list(p) {
      const n = get(p);
      if (!n || n.kind !== "dir") return [];
      return [...n.children].map(([name, c]) => ({ name, kind: c.kind })).sort((a, b) => a.name.localeCompare(b.name));
    },
    async exec(op) {
      const [a, b] = op.paths;
      switch (op.cmd) {
        case "pwd":
          return a;
        case "ls":
          return (await this.list(a)).map((e) => (e.kind === "dir" ? e.name + "/" : e.name)).join("  ") || "(empty)";
        case "cat": {
          const n = get(a);
          return n?.kind === "file" ? n.content : "";
        }
        case "mkdir":
          for (const p of op.paths) {
            if (op.parents) {
              let cur = "";
              for (const part of p.split("/").filter(Boolean)) {
                cur += "/" + part;
                if (!get(cur)) (parentOf(cur) as { children: Map<string, Node> }).children.set(part, dir({}));
              }
            } else (parentOf(p) as { children: Map<string, Node> }).children.set(basename(p), dir({}));
          }
          return "";
        case "touch":
          for (const p of op.paths) {
            const par = parentOf(p) as { children: Map<string, Node> };
            if (!par.children.has(basename(p))) par.children.set(basename(p), file());
          }
          return "";
        case "rm":
          for (const p of op.paths) (parentOf(p) as { children: Map<string, Node> }).children.delete(basename(p));
          return `Moved ${op.paths.length} item(s) to the Trash.`;
        case "mv":
        case "cp": {
          const node = get(a);
          if (!node) throw new Error(`${a} doesn't exist`);
          (parentOf(b) as { children: Map<string, Node> }).children.set(basename(b), op.cmd === "cp" ? clone(node) : node);
          if (op.cmd === "mv") (parentOf(a) as { children: Map<string, Node> }).children.delete(basename(a));
          return "";
        }
        default:
          return "";
      }
    },
  };
}

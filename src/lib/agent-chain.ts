// Planner -> Builder -> Checker chain for small local web apps.
// Each step only sees what it needs (plan + the files it depends on), so small models stay accurate.

export type Msg = { role: "system" | "user" | "assistant"; content: string };
export type CallModel = (role: "planner" | "builder", messages: Msg[]) => Promise<string>;
export interface PlanFile { path: string; purpose: string }
export interface Plan { slug: string; title: string; summary: string; files: PlanFile[] }
export interface Draft { path: string; content: string; previous: string | null; notes: string[] }

export const ALLOWED_FILES = ["index.html", "style.css", "app.js"];

const RULES = `Rules for the app:
- Plain HTML, CSS and JavaScript only. No frameworks, no CDN links, no internet — it must work fully offline.
- Exactly these files: index.html, style.css, app.js. index.html loads style.css, then <script src="db.js"></script>, then <script src="app.js"></script>.
- To save data, use the built-in local database: await db.get(key) returns a saved value (or null); await db.set(key, value) saves any JSON value.
- Keep it small, clear and working.`;

export const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "my-app";

export function extractJson<T>(text: string): T | null {
  const m = text.match(/\{[\s\S]*\}/);
  try { return m ? (JSON.parse(m[0]) as T) : null; } catch { return null; }
}

export function extractCode(text: string): string {
  const fences = [...text.matchAll(/```[a-zA-Z]*\n([\s\S]*?)```/g)].map((m) => m[1]);
  if (fences.length) return fences.sort((a, b) => b.length - a.length)[0].trim() + "\n";
  return text.replace(/^```[a-zA-Z]*\n?|```$/g, "").trim() + "\n";
}

export async function plan(call: CallModel, request: string, existing: { slug: string; files: string[] } | null): Promise<Plan> {
  const raw = await call("planner", [
    { role: "system", content: `You plan small offline web apps. Reply ONLY with JSON: {"title": string, "summary": string, "files": [{"path": "index.html"|"style.css"|"app.js", "purpose": string}]}.\n${RULES}` },
    { role: "user", content: existing ? `Existing app "${existing.slug}" with files ${existing.files.join(", ")}. Change request: ${request}\nList only the files that must change.` : `Build: ${request}` },
  ]);
  const p = extractJson<Partial<Plan>>(raw);
  const files = (p?.files ?? []).filter((f) => f && ALLOWED_FILES.includes(f.path));
  const uniq = ALLOWED_FILES.filter((n) => files.some((f) => f.path === n)).map((n) => files.find((f) => f.path === n)!);
  const title = p?.title?.trim() || request.slice(0, 40);
  return {
    slug: existing?.slug ?? slugify(title),
    title,
    summary: p?.summary?.trim() || request,
    files: uniq.length ? uniq : ALLOWED_FILES.map((path) => ({ path, purpose: path === "index.html" ? "Page structure" : path === "style.css" ? "Look and layout" : "Behaviour and saving data" })),
  };
}

function check(path: string, content: string, html: string | null): string[] {
  const errs: string[] = [];
  if (!content.trim()) errs.push("The file is empty.");
  if (path === "app.js") {
    try {
      // Syntax check only; never executed.
      new Function(`return async () => {\n${content}\n}`);
    } catch (e) {
      errs.push(`JavaScript syntax error: ${(e as Error).message}`);
    }
    if (html) {
      const ids = [...content.matchAll(/getElementById\(\s*["'`]([\w-]+)["'`]\s*\)/g)].map((m) => m[1]);
      const missing = [...new Set(ids)].filter((id) => !new RegExp(`id=["']${id}["']`).test(html));
      if (missing.length) errs.push(`These ids are used but missing from index.html: ${missing.join(", ")}. Only use ids that exist.`);
    }
    if (/https?:\/\/(?!127\.0\.0\.1|localhost)/.test(content)) errs.push("It loads something from the internet; the app must work offline.");
  }
  if (path === "index.html" && !/<html|<body|<div|<main/i.test(content)) errs.push("This doesn't look like an HTML page.");
  return errs;
}

// Deterministic fixes the checker can make itself.
function autofix(path: string, content: string): { content: string; notes: string[] } {
  const notes: string[] = [];
  if (path !== "index.html") return { content, notes };
  let c = content.replace(/<script[^>]+src=["']https?:[^>]*><\/script>/gi, () => { notes.push("Removed an internet script."); return ""; });
  const tag = (s: string) => new RegExp(`<script[^>]+src=["']\\.?/?${s.replace(".", "\\.")}["']`, "i").test(c);
  const add: string[] = [];
  if (!/href=["']\.?\/?style\.css["']/i.test(c)) { c = c.replace(/<\/head>/i, '  <link rel="stylesheet" href="style.css">\n</head>'); notes.push("Linked style.css."); }
  if (!tag("db.js")) { add.push('<script src="db.js"></script>'); notes.push("Added the local database script."); }
  if (!tag("app.js")) { add.push('<script src="app.js"></script>'); notes.push("Added app.js."); }
  if (add.length) c = /<\/body>/i.test(c) ? c.replace(/<\/body>/i, `  ${add.join("\n  ")}\n</body>`) : c + "\n" + add.join("\n") + "\n";
  return { content: c, notes };
}

export async function build(
  call: CallModel,
  p: Plan,
  request: string,
  read: (path: string) => Promise<string | null>,
  onStep: (s: string) => void,
  maxFixes = 2,
): Promise<Draft[]> {
  const drafts: Draft[] = [];
  const current = async (path: string) => drafts.find((d) => d.path === path)?.content ?? (await read(path));
  for (const f of p.files) {
    const previous = await read(f.path);
    const html = f.path === "index.html" ? null : await current("index.html");
    const context = [
      `App: ${p.title} — ${p.summary}`,
      `Files: ${p.files.map((x) => `${x.path} (${x.purpose})`).join("; ")}`,
      html ? `index.html (use its ids and classes):\n${html.slice(0, 6000)}` : "",
      previous ? `Current ${f.path} (edit it, keep what still works):\n${previous.slice(0, 8000)}` : "",
      `Request: ${request}`,
    ].filter(Boolean).join("\n\n");
    const messages: Msg[] = [
      { role: "system", content: `You write ONE file of a small offline web app. Reply with the complete ${f.path} in a single code block, nothing else.\n${RULES}` },
      { role: "user", content: `${context}\n\nWrite ${f.path} now. Purpose: ${f.purpose}.` },
    ];
    onStep(`Writing ${f.path}`);
    let content = extractCode(await call("builder", messages));
    const notes: string[] = [];
    for (let attempt = 0; ; attempt++) {
      const fixed = autofix(f.path, content);
      content = fixed.content;
      notes.push(...fixed.notes);
      onStep(`Checking ${f.path}`);
      const errs = check(f.path, content, html);
      if (!errs.length) break;
      if (attempt >= maxFixes) { notes.push(`Still has problems: ${errs.join(" ")}`); break; }
      notes.push(`Fixing: ${errs.join(" ")}`);
      onStep(`Fixing ${f.path} (${attempt + 1}/${maxFixes})`);
      content = extractCode(await call("builder", [
        ...messages,
        { role: "assistant", content: "```\n" + content + "\n```" },
        { role: "user", content: `The checker found problems:\n- ${errs.join("\n- ")}\nReturn the full corrected ${f.path} in one code block.` },
      ]));
    }
    drafts.push({ path: f.path, content, previous, notes: [...new Set(notes)] });
  }
  return drafts;
}

export function lineDiff(prev: string | null, next: string) {
  const a = (prev ?? "").split("\n");
  const b = next.split("\n");
  const as = new Set(a);
  const bs = new Set(b);
  return { added: b.filter((l) => !as.has(l)).length, removed: prev === null ? 0 : a.filter((l) => !bs.has(l)).length };
}

import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowRight, Bot, File, Folder, Lock, Play, ShieldCheck } from "lucide-react";
import { explainBlocked } from "@/lib/explain-block.functions";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  SUPPORTED,
  analyze,
  createSandboxFs,
  pretty,
  type Entry,
  type Level,
  type ShellFs,
  type Verdict,
  type Visual,
} from "@/lib/safe-shell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Safe Shell — See What a Terminal Command Will Do Before It Runs" },
      {
        name: "description",
        content:
          "Type a terminal command and watch a live safety score and a visual blueprint of your folders update as you type. Dangerous typos and destructive roots are locked out; deletions go to the Trash.",
      },
      { property: "og:title", content: "Safe Shell — Terminal Commands With a Safety Net" },
      {
        property: "og:description",
        content: "Live confidence meter plus an animated file-system blueprint for every command, before anything touches your disk.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SafeShellPage,
});

interface Bridge {
  shell?: {
    home(): Promise<string>;
    stat: ShellFs["stat"];
    list: ShellFs["list"];
    exec: ShellFs["exec"];
  };
}

const LEVEL: Record<Level, { label: string; color: string; text: string }> = {
  safe: { label: "Clean & transparent", color: "var(--radar-safe)", text: "text-radar-safe" },
  destructive: { label: "Destructive — changes files", color: "var(--radar-destructive)", text: "text-radar-destructive" },
  uncertain: { label: "Uncertain paths", color: "var(--radar-uncertain)", text: "text-radar-uncertain" },
  critical: { label: "Critical — locked", color: "var(--radar-critical)", text: "text-radar-critical" },
};

const EXAMPLES = ["ls", "mkdir Photos", "mv doc.txt Desktop/", "mv doc.txt Archive", "rm file .txt", "rm -rf /"];

interface Log {
  id: number;
  kind: "cmd" | "out" | "err";
  text: string;
}

function SafeShellPage() {
  const [fsys, setFs] = useState<ShellFs>(() => createSandboxFs());
  const [cwd, setCwd] = useState("/Users/you");
  const [input, setInput] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [listings, setListings] = useState<Record<string, Entry[]>>({});
  const [version, setVersion] = useState(0);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Log[]>([]);
  const seq = useRef(0);
  const logId = useRef(0);

  // Switch to the real filesystem inside the desktop app.
  useEffect(() => {
    const bridge = (window as Window & { desktop?: Bridge }).desktop?.shell;
    if (!bridge) return;
    void bridge.home().then((home) => {
      setFs({ mode: "desktop", home, stat: bridge.stat, list: bridge.list, exec: bridge.exec });
      setCwd(home);
    });
  }, []);

  useEffect(() => {
    const id = ++seq.current;
    setArmed(false);
    void (async () => {
      const v = await analyze(input, cwd, fsys.home, (p) => fsys.stat(p)).catch(() => null);
      if (id !== seq.current) return;
      setVerdict(v);
      const dirs = new Set<string>([cwd]);
      const vis = v?.visual;
      if (vis?.type === "view") dirs.add(vis.dir);
      if (vis?.type === "create" || vis?.type === "delete") dirs.add(vis.parent);
      if (vis?.type === "transfer") {
        dirs.add(vis.fromDir);
        dirs.add(vis.toDir);
      }
      const entries = await Promise.all([...dirs].map(async (d) => [d, await fsys.list(d).catch(() => [])] as const));
      if (id === seq.current) setListings(Object.fromEntries(entries));
    })();
  }, [input, cwd, fsys, version]);

  const push = (kind: Log["kind"], text: string) =>
    setLog((l) => [...l.slice(-200), { id: logId.current++, kind, text }]);

  const run = async () => {
    if (!verdict?.op || verdict.locked || busy) return;
    if (verdict.level !== "safe" && !armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    push("cmd", `${pretty(fsys.home, cwd)} $ ${input.trim()}`);
    try {
      if (verdict.op.cmd === "cd") setCwd(verdict.op.paths[0]);
      else {
        const out = await fsys.exec(verdict.op);
        if (out) push("out", out);
      }
      setInput("");
    } catch (e) {
      push("err", e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(e));
    } finally {
      setBusy(false);
      setArmed(false);
      setVersion((n) => n + 1);
    }
  };

  const meta = verdict ? LEVEL[verdict.level] : null;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {fsys.mode === "desktop" ? "Connected to your computer" : "Sandbox — practice folders, nothing real is touched"}
        </p>
        <h1 className="mt-2 font-display text-5xl leading-none">Safe Shell</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Type a command. Before anything runs, it is checked against your real folders, scored, and drawn below.
          One plain command at a time — no chaining, wildcards or sudo. Deletions go to the Trash.
        </p>

        {/* Command line */}
        <section className="mt-8 rounded-md bg-card p-4" style={{ border: "1px solid #0A0A0A" }}>
          <div className="flex items-center gap-2 font-mono text-sm">
            <span className="shrink-0 text-muted-foreground">{pretty(fsys.home, cwd)} $</span>
            <Input
              autoFocus
              spellCheck={false}
              autoComplete="off"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void run()}
              placeholder="mkdir Photos"
              className="font-mono"
              aria-label="Command"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setInput(ex)}
                className="rounded-sm px-2 py-0.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
                style={{ border: "1px solid var(--border-subtle)" }}
              >
                {ex}
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
          {/* Safeguard radar */}
          <div>
            <div className="flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.14em]">
              <span>Safeguard radar</span>
              <span className={meta?.text}>{verdict ? `${verdict.score}% · ${meta?.label}` : "Waiting for a command"}</span>
            </div>
            <div className="relative mt-2 h-3 overflow-hidden rounded-sm bg-muted">
              <div
                className={cn("h-full transition-all duration-300", verdict?.level === "critical" && "animate-pulse")}
                style={{
                  width: `${verdict ? Math.max(4, verdict.score) : 0}%`,
                  background: meta?.color,
                  boxShadow: meta ? `0 0 14px ${meta.color}` : undefined,
                }}
              />
            </div>
            {verdict && <p className="mt-2 text-sm">{verdict.summary}</p>}
            {verdict && verdict.issues.length > 0 && (
              <ul className="mt-2 space-y-1">
                {verdict.issues.map((i, k) => (
                  <li key={k} className={cn("flex gap-2 text-sm", i.level !== "info" && LEVEL[i.level as Level].text)}>
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    {i.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <BlockExplainer
            command={input.trim()}
            verdict={verdict}
            cwd={pretty(fsys.home, cwd)}
            check={(c) => analyze(c, cwd, fsys.home, (p) => fsys.stat(p)).catch(() => null)}
            onUse={setInput}
          />
          </div>

          <Button className="mt-4 w-full" size="lg" disabled={!verdict?.op || verdict.locked || busy} onClick={() => void run()}>
            {verdict?.locked ? (
              <>
                <Lock className="h-4 w-4" /> Locked — fix the command first
              </>
            ) : armed ? (
              <>
                <AlertTriangle className="h-4 w-4" /> Click again to confirm
              </>
            ) : (
              <>
                <Play className="h-4 w-4" /> Run
              </>
            )}
          </Button>
        </section>

        {/* Blueprint */}
        <section className="mt-6 rounded-md bg-card p-4" style={{ border: "1px solid #0A0A0A" }}>
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.14em]">Live-impact blueprint</h2>
            <Badge variant="outline" className="font-mono text-[10px]">
              {SUPPORTED.join(" · ")}
            </Badge>
          </div>
          <Blueprint visual={verdict?.visual ?? { type: "view", dir: cwd }} listings={listings} home={fsys.home} />
        </section>

        {/* Output */}
        <section className="mt-6 rounded-md bg-primary p-4 font-mono text-[12px] text-primary-foreground">
          <div className="mb-2 flex items-center gap-2 uppercase tracking-[0.14em] opacity-60">
            <ShieldCheck className="h-3.5 w-3.5" /> Output
          </div>
          <div className="max-h-64 space-y-1 overflow-auto whitespace-pre-wrap">
            {log.length === 0 && <p className="opacity-50">Nothing run yet.</p>}
            {log.map((l) => (
              <p key={l.id} className={cn(l.kind === "cmd" && "opacity-60", l.kind === "err" && "text-radar-critical")}>
                {l.text}
              </p>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

type Explain = { why: string; alternative: string; note: string; altScore: number | null; altLevel: Level | null };

function BlockExplainer({
  command,
  verdict,
  cwd,
  check,
  onUse,
}: {
  command: string;
  verdict: Verdict | null;
  cwd: string;
  check: (c: string) => Promise<Verdict | null>;
  onUse: (c: string) => void;
}) {
  const explain = useServerFn(explainBlocked);
  const [forCmd, setForCmd] = useState("");
  const [res, setRes] = useState<Explain | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const locked = !!verdict?.locked;

  // Fresh context for every command: clear the previous answer when the command changes.
  useEffect(() => {
    if (command !== forCmd) {
      setRes(null);
      setErr(null);
    }
  }, [command, forCmd]);

  const ask = async () => {
    if (!verdict || !locked || loading) return;
    setLoading(true);
    setRes(null);
    setErr(null);
    setForCmd(command);
    try {
      const r = await explain({ data: { command, cwd, issues: verdict.issues.map((i) => i.text) } });
      if ("error" in r && r.error) setErr(r.error);
      else if ("why" in r) {
        const v = r.alternative ? await check(r.alternative) : null;
        setRes({ why: r.why ?? "", alternative: r.alternative ?? "", note: r.note ?? "", altScore: v?.score ?? null, altLevel: v?.level ?? null });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : typeof e === "string" ? e : "Something went wrong — try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col rounded-md bg-primary p-3 font-mono text-[12px] text-primary-foreground">
      <div className="flex items-center justify-between uppercase tracking-[0.14em] opacity-70">
        <span className="flex items-center gap-1.5 text-[11px]">
          <Bot className="h-3.5 w-3.5" /> Lock explainer
        </span>
        <span className="text-[10px]">explains only · never runs</span>
      </div>
      <div className="mt-3 min-h-[96px] flex-1 space-y-2 whitespace-pre-wrap">
        {!locked && !res && !loading && <p className="opacity-50">When a command is locked, ask here why — and get a safe alternative.</p>}
        {locked && !res && !loading && !err && <p className="opacity-70">“{command}” is locked. Press Explain.</p>}
        {loading && <p className="animate-pulse opacity-70">Reading “{forCmd}”…</p>}
        {err && <p className="text-radar-critical">{err}</p>}
        {res && (
          <>
            <p className="opacity-60">&gt; {forCmd}</p>
            <p>{res.why}</p>
            {res.alternative ? (
              <div className="rounded-sm p-2" style={{ border: "1px solid currentColor" }}>
                <p className="text-[10px] uppercase opacity-60">Safe alternative</p>
                <p className="mt-1 text-[13px]">$ {res.alternative}</p>
                {res.note && <p className="mt-1 opacity-70">{res.note}</p>}
                <p className="mt-1 text-[10px] uppercase opacity-60">
                  Re-checked by Safe Shell: {res.altScore === null ? "can't check" : `${res.altScore}% · ${LEVEL[res.altLevel!].label}`}
                </p>
              </div>
            ) : (
              <p className="opacity-70">No safe alternative exists for this one.</p>
            )}
          </>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="bg-primary-foreground text-primary hover:bg-primary-foreground/90" disabled={!locked || loading} onClick={() => void ask()}>
          <Bot className="h-3.5 w-3.5" /> Explain
        </Button>
        {res?.alternative && res.altLevel !== "critical" && (
          <Button size="sm" className="bg-primary-foreground text-primary hover:bg-primary-foreground/90" onClick={() => onUse(res.alternative)}>
            Use alternative
          </Button>
        )}
      </div>
    </div>
  );
}

function DirBox({
  title,
  entries,
  ghosts = [],
  ghostKind = "dir",
  highlight,
  deleted = [],
  missing,
}: {
  title: string;
  entries: Entry[];
  ghosts?: string[];
  ghostKind?: "file" | "dir";
  highlight?: string;
  deleted?: string[];
  missing?: boolean;
}) {
  return (
    <div
      className={cn("min-w-0 flex-1 rounded-md p-3", missing && "animate-pulse")}
      style={{ border: missing ? "2px dashed var(--radar-critical)" : "1px solid #0A0A0A" }}
    >
      <p className={cn("mb-2 truncate font-mono text-[11px]", missing && "text-radar-critical")}>
        {title}
        {missing && " — doesn't exist"}
      </p>
      <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {entries.slice(0, 30).map((e) => {
          const del = deleted.includes(e.name);
          const hi = highlight === e.name;
          const Icon = e.kind === "dir" ? Folder : File;
          return (
            <li
              key={e.name}
              className={cn(
                "flex items-center gap-1.5 truncate rounded-sm px-1.5 py-1 text-[12px]",
                del && "text-radar-critical line-through",
                hi && "bg-muted font-semibold",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
              <span className="truncate">{e.name}</span>
            </li>
          );
        })}
        {ghosts.map((g) => {
          const Icon = ghostKind === "dir" ? Folder : File;
          return (
            <li
              key={`ghost-${g}`}
              className="animate-ghost flex items-center gap-1.5 truncate rounded-sm px-1.5 py-1 text-[12px] text-radar-safe"
              style={{ border: "1px dashed var(--radar-safe)" }}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
              <span className="truncate">{g}</span>
            </li>
          );
        })}
        {entries.length === 0 && ghosts.length === 0 && <li className="text-[12px] text-muted-foreground">(empty)</li>}
      </ul>
    </div>
  );
}

function Arrow({ broken, label }: { broken: boolean; label: string }) {
  const stroke = broken ? "var(--radar-critical)" : "var(--radar-safe)";
  return (
    <div className="flex shrink-0 flex-col items-center justify-center gap-1 px-1 py-2">
      <svg width="110" height="24" viewBox="0 0 110 24" aria-hidden>
        {broken ? (
          <>
            <line x1="2" y1="12" x2="44" y2="12" stroke={stroke} strokeWidth="2.5" />
            <line x1="60" y1="16" x2="96" y2="6" stroke={stroke} strokeWidth="2.5" strokeDasharray="4 4" />
            <path d="M48 6 L56 18 M56 6 L48 18" stroke={stroke} strokeWidth="2" />
          </>
        ) : (
          <>
            <line x1="2" y1="12" x2="96" y2="12" stroke={stroke} strokeWidth="2.5" strokeDasharray="8 4" className="animate-dash" />
            <path d="M94 5 L106 12 L94 19" fill="none" stroke={stroke} strokeWidth="2.5" />
          </>
        )}
      </svg>
      <span className={cn("font-mono text-[10px] uppercase", broken ? "text-radar-critical" : "text-radar-safe")}>{label}</span>
    </div>
  );
}

function Blueprint({ visual, listings, home }: { visual: Visual; listings: Record<string, Entry[]>; home: string }) {
  const L = (d: string) => listings[d] ?? [];
  const P = (d: string) => pretty(home, d);
  return (
    <div className="mt-4">
      {visual.type === "view" && <DirBox title={P(visual.dir)} entries={L(visual.dir)} />}
      {visual.type === "create" && (
        <DirBox
          title={P(visual.parent)}
          entries={L(visual.parent)}
          ghosts={visual.broken ? [] : visual.names.filter((n) => !L(visual.parent).some((e) => e.name === n))}
          ghostKind={visual.kind}
          missing={visual.broken}
        />
      )}
      {visual.type === "delete" && <DirBox title={P(visual.parent)} entries={L(visual.parent)} deleted={visual.names} />}
      {visual.type === "transfer" && (
        <div className="relative">
          <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
            <DirBox title={P(visual.fromDir)} entries={L(visual.fromDir)} highlight={visual.name} />
            <Arrow broken={visual.broken} label={visual.broken ? "broken path" : visual.mode} />
            <DirBox
              title={visual.broken ? `${P(visual.toDir)}/${visual.toName}`.replace("//", "/") : P(visual.toDir)}
              entries={visual.broken ? [] : L(visual.toDir).filter((e) => !(visual.mode === "rename" && e.name === visual.name))}
              ghosts={visual.broken ? [] : [visual.toName]}
              ghostKind="file"
              missing={visual.broken}
            />
          </div>
          {visual.broken && visual.note && (
            <div
              role="alert"
              className="mx-auto mt-3 flex max-w-md items-start gap-2 rounded-md bg-card p-3 text-sm text-radar-critical"
              style={{ border: "2px solid var(--radar-critical)" }}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {visual.note}
            </div>
          )}
          {!visual.broken && (
            <p className="mt-2 flex items-center justify-center gap-1 font-mono text-[11px] text-muted-foreground">
              {visual.name} <ArrowRight className="h-3 w-3" /> {P(visual.toDir)}/{visual.toName}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

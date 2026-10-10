import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Eye, FolderOpen, Hammer, Loader2, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { ModelPicker } from "@/components/llm/model-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocalLlm } from "@/hooks/use-local-llm";
import { cn } from "@/lib/utils";
import { build, lineDiff, plan, type CallModel, type Draft, type Plan } from "@/lib/agent-chain";

export const Route = createFileRoute("/agent")({
  head: () => ({
    meta: [
      { title: "Agent — Build Small Apps on Your Computer, Offline" },
      { name: "description", content: "A desktop agent that plans, writes, checks and previews small web apps in a local folder, with a built-in local database. Runs fully offline." },
      { property: "og:title", content: "Agent — Build Small Apps on Your Computer, Offline" },
      { property: "og:description", content: "Plan, write, check and preview small offline web apps with a local model." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AgentPage,
});

type Source = "builtin" | "runner" | "cloud";
interface AppInfo { slug: string; files: string[] }
interface Runner { name: string; baseURL: string; models: string[] }
interface AgentBridge {
  getSettings(): Promise<{ baseURL: string; model: string; plannerModel: string; hasKey: boolean }>;
  setSettings(s: { baseURL: string; model: string; plannerModel: string; key?: string }): Promise<boolean>;
  detect(): Promise<Runner[]>;
  llm(messages: unknown[], role: string): Promise<string>;
  listApps(): Promise<AppInfo[]>;
  read(slug: string, file: string): Promise<string | null>;
  write(slug: string, files: { path: string; content: string }[]): Promise<boolean>;
  deleteApp(slug: string): Promise<boolean>;
  preview(slug: string): Promise<string>;
  reveal(slug: string): Promise<string>;
  jcode?: {
    status(): Promise<{ available: boolean; version?: string }>;
    run(slug: string, message: string): Promise<boolean>;
    cancel(): Promise<boolean>;
    onEvent(cb: (ev: { type: "out" | "err" | "done"; data: string | number }) => void): () => void;
  };
}

/** Turns a Jcode NDJSON line into a short readable step, or null to hide it. */
function jcodeLine(raw: string): string | null {
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const t = String(j.type ?? j.event ?? "");
    const tool = (j.tool ?? j.name) as string | undefined;
    if (tool) return `${tool}${j.path ? ` ${String(j.path)}` : ""}`;
    if (typeof j.text === "string" && j.text.trim()) return j.text.trim().slice(0, 300);
    if (typeof j.message === "string") return j.message.slice(0, 300);
    return t && !/delta|token/i.test(t) ? t : null;
  } catch {
    return raw.slice(0, 300);
  }
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "app";

const label = "font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground";
const card = "rounded-md bg-card p-5";
const border = { border: "1px solid #0A0A0A" };
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");

function AgentPage() {
  const [agent, setAgent] = useState<AgentBridge | null | undefined>(undefined);
  useEffect(() => setAgent((window as Window & { desktop?: { agent?: AgentBridge } }).desktop?.agent ?? null), []);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className={label}>{agent ? "Connected to your computer · works offline" : "Desktop app only"}</p>
        <h1 className="mt-2 font-display text-5xl leading-none">Agent</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Describe a small app — a mini game, a schedule maker. A planner model splits it into files, a builder writes each one,
          and a checker sends mistakes back for fixing. You approve every file before it's saved in “Workbench Apps”.
        </p>
        {agent === null && (
          <div className={cn(card, "mt-8")} style={border}>
            <p className="text-sm">
              The agent needs to save files on your computer, so it only runs in the desktop app. Get the Mac version on the{" "}
              <Link to="/fetcher" className="underline underline-offset-4">Fetcher page</Link>.
            </p>
          </div>
        )}
        {agent && <Workspace agent={agent} />}
      </main>
    </div>
  );
}

function Workspace({ agent }: { agent: AgentBridge }) {
  const llm = useLocalLlm();
  const [source, setSource] = useState<Source>("builtin");
  const [runners, setRunners] = useState<Runner[] | null>(null);
  const [cfg, setCfg] = useState({ baseURL: "", model: "", plannerModel: "", key: "", hasKey: false });
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [editing, setEditing] = useState<AppInfo | null>(null);
  const [request, setRequest] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thePlan, setPlan] = useState<Plan | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [choice, setChoice] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<string | null>(null);

  const refreshApps = useCallback(() => agent.listApps().then(setApps).catch(() => setApps([])), [agent]);
  const detect = useCallback(() => agent.detect().then(setRunners).catch(() => setRunners([])), [agent]);

  useEffect(() => {
    setSource((localStorage.getItem("agent-source") as Source) || "builtin");
    void agent.getSettings().then((s) => setCfg((c) => ({ ...c, ...s })));
    void refreshApps();
    void detect();
  }, [agent, refreshApps, detect]);

  const pickSource = (s: Source) => {
    setSource(s);
    localStorage.setItem("agent-source", s);
    setSavedMsg(null);
  };

  const saveRemote = async (next = cfg) => {
    setSavedMsg(null);
    try {
      await agent.setSettings({ baseURL: next.baseURL, model: next.model, plannerModel: next.plannerModel, ...(next.key ? { key: next.key } : {}) });
      setCfg({ ...next, key: "", hasKey: next.hasKey || !!next.key });
      setSavedMsg("Saved.");
    } catch (e) {
      setSavedMsg(errText(e));
    }
  };

  const ready =
    source === "builtin" ? llm.status === "ready" : source === "runner" ? !!(cfg.baseURL.startsWith("http://127.0.0.1") && cfg.model) : !!(cfg.baseURL && cfg.model);

  const [jcode, setJcode] = useState<{ available: boolean; version?: string } | null>(null);
  const [harness, setHarness] = useState<"chain" | "jcode">("chain");
  useEffect(() => {
    if (!agent.jcode) return setJcode({ available: false });
    void agent.jcode.status().then(setJcode).catch(() => setJcode({ available: false }));
  }, [agent]);
  const useJcode = harness === "jcode" && source === "runner" && !!jcode?.available;

  const runJcode = async () => {
    if (!agent.jcode) return;
    const slug = editing?.slug ?? (() => {
      const base = slugify(request.split(/\s+/).slice(0, 5).join(" "));
      return apps.some((a) => a.slug === base) ? `${base}-${Date.now().toString(36).slice(-4)}` : base;
    })();
    setBusy(true);
    setError(null);
    setDrafts([]);
    setSaved(null);
    setSteps([`Jcode working in Workbench Apps/${slug}`]);
    const brief = `${request.trim()}\n\nBuild a small offline web app in this folder using only index.html, style.css and app.js (plain HTML/CSS/JS, no internet links). For saved data use the global window.db (get/set/all, async) by adding <script src="db.js"></script> before app.js.`;
    const off = agent.jcode.onEvent((ev) => {
      if (ev.type === "done") {
        off();
        setBusy(false);
        if (ev.data === 0) {
          setSteps((x) => [...x, "Finished"]);
          setSaved(slug);
          void refreshApps();
        } else setError(`Jcode stopped (${String(ev.data)}). Check that your runner model is loaded.`);
        return;
      }
      const line = jcodeLine(String(ev.data));
      if (line) setSteps((x) => [...x.slice(-80), ev.type === "err" ? `! ${line}` : line]);
    });
    try {
      await agent.jcode.run(slug, brief);
    } catch (e) {
      off();
      setBusy(false);
      setError(errText(e));
    }
  };

  const call: CallModel = async (role, messages) => {
    if (source === "builtin") return llm.generate(messages, { maxNewTokens: 2048, temperature: 0.2 });
    return agent.llm(messages, role);
  };

  const run = async () => {
    if (!request.trim() || busy || !ready) return;
    if (useJcode) return runJcode();
    setBusy(true);
    setError(null);
    setDrafts([]);
    setPlan(null);
    setSaved(null);
    const log = (s: string) => setSteps((x) => [...x, s]);
    setSteps(["Planning"]);
    try {
      const p = await plan(call, request.trim(), editing);
      if (!editing && apps.some((a) => a.slug === p.slug)) p.slug = `${p.slug}-${Date.now().toString(36).slice(-4)}`;
      setPlan(p);
      log(`Plan: ${p.files.map((f) => f.path).join(", ")}`);
      const out = await build(call, p, request.trim(), (f) => (editing ? agent.read(p.slug, f) : Promise.resolve(null)), log);
      setDrafts(out);
      setChoice(Object.fromEntries(out.map((d) => [d.path, true])));
      log("Ready for your review");
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!thePlan) return;
    const files = drafts.filter((d) => choice[d.path]).map(({ path, content }) => ({ path, content }));
    if (!files.length) return;
    try {
      await agent.write(thePlan.slug, files);
      setSaved(thePlan.slug);
      setDrafts([]);
      void refreshApps();
    } catch (e) {
      setError(errText(e));
    }
  };

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        {/* Build */}
        <section className={card} style={border}>
          <div className="flex items-center justify-between">
            <p className={label}>{editing ? `Edit “${editing.slug}”` : "New app"}</p>
            {editing && (
              <button className="font-mono text-[11px] uppercase text-muted-foreground hover:text-foreground" onClick={() => setEditing(null)}>
                Cancel edit
              </button>
            )}
          </div>
          <textarea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            rows={4}
            placeholder={editing ? "What should change? e.g. add a dark mode button" : "e.g. A weekly schedule maker where I add tasks to days and they stay saved"}
            className="mt-3 w-full resize-y rounded-md bg-background p-3 text-sm outline-none focus:ring-1 focus:ring-ring"
            style={{ border: "1px solid var(--border-subtle)" }}
          />
          {jcode?.available && source === "runner" && (
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-md p-1" style={{ border: "1px solid var(--border-subtle)" }}>
              {([["chain", "Plan → write → check"], ["jcode", "Jcode agent"]] as const).map(([k, t]) => (
                <button key={k} disabled={busy} onClick={() => setHarness(k)} className={cn("rounded-sm py-1.5 font-mono text-[11px] uppercase", harness === k ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                  {t}
                </button>
              ))}
            </div>
          )}
          {useJcode && (
            <p className="mt-2 text-[12px] text-muted-foreground">
              Jcode edits files straight into the app's folder (no Apply/Skip step) and can't run terminal commands. Best with a 7B+ model.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Button className="flex-1" size="lg" disabled={!request.trim() || busy || !ready} onClick={() => void run()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hammer className="h-4 w-4" />}
              {busy ? "Working…" : !ready ? "Set up a model first" : useJcode ? "Build with Jcode" : editing ? "Plan the change" : "Build it"}
            </Button>
            {busy && useJcode && (
              <Button size="lg" variant="outline" onClick={() => void agent.jcode?.cancel()}>
                <X className="h-4 w-4" /> Stop
              </Button>
            )}
          </div>
          {error && <p className="mt-3 text-sm text-radar-critical">{error}</p>}
          {steps.length > 0 && (
            <ol className="mt-4 space-y-1 rounded-md bg-primary p-3 font-mono text-[12px] text-primary-foreground">
              {steps.map((s, i) => (
                <li key={i} className={cn(i === steps.length - 1 && busy ? "animate-pulse" : "opacity-80")}>
                  {i === steps.length - 1 && busy ? "› " : "✓ "}
                  {s}
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Review */}
        {drafts.length > 0 && thePlan && (
          <section className={card} style={border}>
            <p className={label}>Review — {thePlan.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{thePlan.summary}</p>
            <ul className="mt-4 space-y-3">
              {drafts.map((d) => {
                const diff = lineDiff(d.previous, d.content);
                const on = choice[d.path];
                return (
                  <li key={d.path} className="rounded-md p-3" style={{ border: `1px solid ${on ? "#0A0A0A" : "var(--border-subtle)"}` }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-mono text-[13px]">
                        {d.path}{" "}
                        <span className="text-radar-safe">+{diff.added}</span>{" "}
                        {d.previous !== null && <span className="text-radar-critical">−{diff.removed}</span>}
                        {d.previous === null && <span className="text-muted-foreground"> new</span>}
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" variant={on ? "default" : "outline"} onClick={() => setChoice((c) => ({ ...c, [d.path]: true }))}>
                          <Check className="h-3.5 w-3.5" /> Apply
                        </Button>
                        <Button size="sm" variant={on ? "outline" : "default"} onClick={() => setChoice((c) => ({ ...c, [d.path]: false }))}>
                          <X className="h-3.5 w-3.5" /> Skip
                        </Button>
                      </div>
                    </div>
                    {d.notes.map((n, i) => (
                      <p key={i} className={cn("mt-1 text-[12px]", n.startsWith("Still") ? "text-radar-critical" : "text-muted-foreground")}>
                        Checker: {n}
                      </p>
                    ))}
                    <pre className="mt-2 max-h-64 overflow-auto rounded-sm bg-primary p-2 font-mono text-[11px] text-primary-foreground">{d.content}</pre>
                  </li>
                );
              })}
            </ul>
            <Button className="mt-4 w-full" disabled={!drafts.some((d) => choice[d.path])} onClick={() => void apply()}>
              Save {drafts.filter((d) => choice[d.path]).length} file(s) to Workbench Apps/{thePlan.slug}
            </Button>
          </section>
        )}
        {saved && (
          <section className={cn(card, "flex flex-wrap items-center justify-between gap-3")} style={border}>
            <p className="text-sm">Saved “{saved}”.</p>
            <Button size="sm" onClick={() => void agent.preview(saved)}>
              <Eye className="h-3.5 w-3.5" /> Open preview
            </Button>
          </section>
        )}

        {/* My apps */}
        <section className={card} style={border}>
          <div className="flex items-center justify-between">
            <p className={label}>My apps</p>
            <button aria-label="Refresh" onClick={() => void refreshApps()} className="text-muted-foreground hover:text-foreground">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          {apps.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No apps yet.</p>}
          <ul className="mt-3 divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {apps.map((a) => (
              <li key={a.slug} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="font-mono text-[13px]">{a.slug}</p>
                  <p className="text-[12px] text-muted-foreground">{a.files.join(" · ") || "empty"}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => void agent.preview(a.slug)}><Eye className="h-3.5 w-3.5" /> Open</Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditing(a); setRequest(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                  <Button size="sm" variant="outline" aria-label="Show folder" onClick={() => void agent.reveal(a.slug)}><FolderOpen className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="outline" aria-label="Move to Trash" onClick={() => { if (confirm(`Move “${a.slug}” to the Trash?`)) void agent.deleteApp(a.slug).then(refreshApps); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Model setup */}
      <aside className="space-y-6">
        <section className={card} style={border}>
          <p className={label}>Model</p>
          <div className="mt-3 grid grid-cols-3 gap-1 rounded-md p-1" style={{ border: "1px solid var(--border-subtle)" }}>
            {([["builtin", "Built-in"], ["runner", "Local runner"], ["cloud", "Own key"]] as const).map(([k, t]) => (
              <button key={k} onClick={() => pickSource(k)} className={cn("rounded-sm py-1.5 font-mono text-[11px] uppercase", source === k ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                {t}
              </button>
            ))}
          </div>

          {source === "builtin" && (
            <p className="mt-3 text-[13px] text-muted-foreground">
              Runs inside the app, fully offline after one download. Good for small apps. Load a model below — the coder models work best.
            </p>
          )}

          {source === "runner" && (
            <div className="mt-3 space-y-3 text-[13px]">
              <p className="text-muted-foreground">
                Uses Ollama or LM Studio on this Mac — fully offline, and bigger models than the built-in one. Pick a small model to plan and a bigger one to write.
              </p>
              <Button size="sm" variant="outline" onClick={() => void detect()}><RefreshCw className="h-3.5 w-3.5" /> Look again</Button>
              {runners?.length === 0 && (
                <p className="text-radar-uncertain">No runner found. Install Ollama (ollama.com), run a model once, then press Look again.</p>
              )}
              {runners?.map((r) => (
                <div key={r.baseURL} className="space-y-2 rounded-md p-3" style={{ border: "1px solid var(--border-subtle)" }}>
                  <p className="font-mono text-[12px]">{r.name} · {r.models.length} model(s)</p>
                  {(["model", "plannerModel"] as const).map((field) => (
                    <label key={field} className="block">
                      <span className={label}>{field === "model" ? "Builder (writes code)" : "Planner (optional, small)"}</span>
                      <select
                        className="mt-1 w-full rounded-md bg-background p-2 font-mono text-[12px]"
                        style={{ border: "1px solid var(--border-subtle)" }}
                        value={cfg.baseURL === r.baseURL ? cfg[field] : ""}
                        onChange={(e) => setCfg((c) => ({ ...c, baseURL: r.baseURL, [field]: e.target.value }))}
                      >
                        <option value="">{field === "model" ? "Choose…" : "Same as builder"}</option>
                        {r.models.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              ))}
              {runners && runners.length > 0 && (
                <Button size="sm" className="w-full" disabled={!cfg.model} onClick={() => void saveRemote()}>Use these models</Button>
              )}
            </div>
          )}

          {source === "cloud" && (
            <div className="mt-3 space-y-2 text-[13px]">
              <p className="text-muted-foreground">Any OpenAI-compatible service. Needs internet. The key is locked in this Mac's keychain.</p>
              <Input placeholder="Address, e.g. https://api.openai.com/v1" value={cfg.baseURL} onChange={(e) => setCfg((c) => ({ ...c, baseURL: e.target.value }))} className="font-mono text-[12px]" />
              <Input placeholder="Builder model" value={cfg.model} onChange={(e) => setCfg((c) => ({ ...c, model: e.target.value }))} className="font-mono text-[12px]" />
              <Input placeholder="Planner model (optional)" value={cfg.plannerModel} onChange={(e) => setCfg((c) => ({ ...c, plannerModel: e.target.value }))} className="font-mono text-[12px]" />
              <Input type="password" placeholder={cfg.hasKey ? "Key saved — type to replace" : "API key"} value={cfg.key} onChange={(e) => setCfg((c) => ({ ...c, key: e.target.value }))} className="font-mono text-[12px]" />
              <Button size="sm" className="w-full" disabled={!cfg.baseURL || !cfg.model} onClick={() => void saveRemote()}>Save</Button>
            </div>
          )}
          {savedMsg && <p className="mt-2 text-[12px] text-muted-foreground">{savedMsg}</p>}
          <p className={cn("mt-3 font-mono text-[11px] uppercase", ready ? "text-radar-safe" : "text-radar-uncertain")}>
            {ready ? "● Ready" : "○ Not set up yet"}
          </p>
        </section>
        {source === "builtin" && <ModelPicker compact />}
      </aside>
    </div>
  );
}

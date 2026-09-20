import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Download, FolderOpen, Square, Terminal, Trash2, AlertTriangle } from "lucide-react";
import desktopBundle from "@/assets/desktop-bundle.tar.gz.asset.json";
import macArm from "@/assets/desktop-bundle-mac-arm64.zip.asset.json";
import macIntel from "@/assets/desktop-bundle-mac-x64.zip.asset.json";
import {
  AUDIO_CONTAINERS,
  CONTAINER_FORMATS,
  COOKIE_SOURCES,
  QUALITY_PRESETS,
  buildPayload,
  detectPlatform,
  parseUrls,
  previewCommand,
  sanitizeUrl,
  type DownloadPayload,
  type FormState,
} from "@/lib/cli-payload";

export const Route = createFileRoute("/fetcher")({
  head: () => ({
    meta: [
      { title: "Fetcher — GUI Front-End for Local yt-dlp Downloads" },
      {
        name: "description",
        content:
          "A clean dashboard for your local yt-dlp service: paste one link or a batch, pick quality and container, toggle audio-only, subtitles and playlists, then watch live terminal output with progress and ETA.",
      },
      { property: "og:title", content: "Fetcher — GUI Front-End for Local yt-dlp Downloads" },
      {
        property: "og:description",
        content:
          "Configure quality, container, audio extraction, subtitles and output paths, dispatch to your local downloader API, and stream stdout in a live console.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FetcherPage,
});

const DEFAULT_ENDPOINT = "http://localhost:3000";
const MAX_LINES = 600;

interface DesktopBridge {
  isDesktop: boolean;
  pickDirectory: () => Promise<string | null>;
}

function desktopBridge(): DesktopBridge | undefined {
  return (window as Window & { desktop?: DesktopBridge }).desktop;
}

type LogKind = "out" | "err" | "sys";
interface LogLine {
  id: number;
  kind: LogKind;
  text: string;
}

function parseProgress(line: string) {
  const structured = line.match(/\[progress\]\s*([\d.]+)%?\s*\|\s*([^|]*)\|\s*(.*)$/i);
  if (structured) {
    return {
      percent: Math.min(100, Number(structured[1])),
      speed: structured[2].trim() || null,
      eta: structured[3].trim() || null,
    };
  }
  const pct = line.match(/(\d{1,3}(?:\.\d)?)%/);
  const speed = line.match(/at\s+([\d.]+\s*[KMG]i?B\/s)/i);
  const eta = line.match(/ETA\s+([\d:]+)/i);
  return {
    percent: pct ? Math.min(100, Number(pct[1])) : null,
    speed: speed ? speed[1] : null,
    eta: eta ? eta[1] : null,
  };
}

function FetcherPage() {
  const [endpoint, setEndpoint] = useState(DEFAULT_ENDPOINT);
  const [batch, setBatch] = useState(false);
  const [state, setState] = useState<FormState>({
    urlsRaw: "",
    quality: "best",
    format: "mp4",
    audioOnly: false,
    embedSubtitles: false,
    isPlaylist: false,
    outputDirectory: "",
    customFilename: "",
    cookiesFromBrowser: "none",
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [running, setRunning] = useState(false);
  const [percent, setPercent] = useState(0);
  const [speed, setSpeed] = useState<string | null>(null);
  const [eta, setEta] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [serviceReady, setServiceReady] = useState<boolean | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);

  const consoleRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const counter = useRef(0);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((s) => ({ ...s, [key]: value }));

  const push = useCallback((text: string, kind: LogKind = "out") => {
    setLines((prev) => {
      const next = [...prev, { id: counter.current++, kind, text }];
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
    });
    const p = parseProgress(text);
    if (p.percent !== null) setPercent(p.percent);
    if (p.speed) setSpeed(p.speed);
    if (p.eta) setEta(p.eta);
  }, []);

  useEffect(() => {
    consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight });
  }, [lines]);

  useEffect(() => {
    setIsDesktop(Boolean(desktopBridge()?.isDesktop));
    const controller = new AbortController();
    fetch(`${DEFAULT_ENDPOINT}/api/health`, { signal: controller.signal })
      .then((response) => setServiceReady(response.ok))
      .catch(() => setServiceReady(false));
    return () => controller.abort();
  }, []);

  useEffect(
    () => () => {
      sourceRef.current?.close();
      abortRef.current?.abort();
    },
    [],
  );

  const audioMode = state.audioOnly || state.quality === "audio";
  const preview = useMemo(() => {
    const { payload } = buildPayload(state);
    return payload ? previewCommand(payload) : null;
  }, [state]);

  const cleaned = useMemo(
    () =>
      parseUrls(state.urlsRaw).map((original) => {
        const clean = sanitizeUrl(original);
        return { original, clean, changed: clean !== original, platform: detectPlatform(clean) };
      }),
    [state.urlsRaw],
  );

  const finish = useCallback(
    (message: string) => {
      sourceRef.current?.close();
      sourceRef.current = null;
      abortRef.current = null;
      setRunning(false);
      setJobId(null);
      push(message, "sys");
    },
    [push],
  );

  const listen = useCallback(
    (id: string) => {
      const url = `${endpoint.replace(/\/$/, "")}/api/download/stream?jobId=${encodeURIComponent(id)}`;
      const es = new EventSource(url);
      sourceRef.current = es;
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.done) return finish("[process finished]");
          push(String(data.line ?? data.message ?? ev.data), data.stream === "stderr" ? "err" : "out");
        } catch {
          push(ev.data);
        }
      };
      es.addEventListener("stderr", (ev) => push(String((ev as MessageEvent).data), "err"));
      es.addEventListener("done", (event) => {
        let code = 1;
        try {
          const result = JSON.parse((event as MessageEvent).data) as { code?: number };
          code = result.code ?? 1;
        } catch {
          code = 1;
        }
        if (code === 0) {
          setPercent(100);
          finish("[download completed]");
        } else {
          finish(`[download failed — exit ${code}] Check the error above; no file was completed.`);
        }
      });
      es.onerror = () => finish("[stream closed — is the local service still running?]");
    },
    [endpoint, finish, push],
  );

  const readStream = useCallback(
    async (res: Response) => {
      const reader = res.body?.getReader();
      if (!reader) return finish("[no output stream returned]");
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const clean = part.replace(/^data:\s?/, "").trim();
          if (clean) push(clean);
        }
      }
      finish("[process finished]");
    },
    [finish, push],
  );

  const start = async () => {
    const { payload, errors: errs } = buildPayload(state);
    setErrors(errs);
    if (!payload) return;

    setLines([]);
    setPercent(0);
    setSpeed(null);
    setEta(null);
    setRunning(true);
    push(`$ ${previewCommand(payload)}`, "sys");

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(`${endpoint.replace(/\/$/, "")}/api/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload satisfies DownloadPayload),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text();
        push(`HTTP ${res.status} — ${body.slice(0, 500)}`, "err");
        return finish("[request rejected by the local service]");
      }
      const type = res.headers.get("content-type") ?? "";
      if (type.includes("text/event-stream") || type.includes("text/plain")) {
        await readStream(res);
        return;
      }
      const data = (await res.json().catch(() => null)) as { jobId?: string } | null;
      if (data?.jobId) {
        setJobId(data.jobId);
        push(`[job ${data.jobId} accepted — attaching to output stream]`, "sys");
        listen(data.jobId);
      } else {
        finish("[service accepted the job but returned no stream to follow]");
      }
    } catch (err) {
      if (controller.signal.aborted) return finish("[cancelled]");
      push(
        `Could not reach ${endpoint}. Start your local downloader service and try again.`,
        "err",
      );
      finish("[not connected]");
    }
  };

  const cancel = async () => {
    push("[sending kill signal…]", "sys");
    const base = endpoint.replace(/\/$/, "");
    try {
      if (jobId) {
        await fetch(`${base}/api/download/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        });
      }
    } catch {
      push("[could not reach the service to cancel — closing the stream locally]", "err");
    }
    abortRef.current?.abort();
    finish("[cancelled]");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <header className="max-w-2xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Local tooling
          </p>
          <h1 className="mt-2 font-display text-5xl leading-[1.05] sm:text-6xl">Fetcher</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            A front end for the downloader running on your own machine. Paste a link, choose how you
            want the file, and watch the process output as it happens. Nothing is downloaded through
            this page — it only tells your local service what to do.
          </p>
        </header>

        {!isDesktop && (
          <section className="mt-8 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-6">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="max-w-xl">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  Ready-made bundle
                </p>
                <h2 className="mt-2 font-display text-2xl">Want the desktop version instead?</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                  The desktop bundle already contains the video fetcher and media converter, and
                  starts its own local service when you open it — no terminal, no installs. Use this
                  page as-is if your local service is already running.
                </p>
              </div>
              <div className="flex flex-col items-start gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <a href={macArm.url} download>
                      <Download className="mr-2 size-4" />
                      Mac · Apple Silicon (185 MB)
                    </a>
                  </Button>
                  <Button asChild variant="outline">
                    <a href={macIntel.url} download>
                      <Download className="mr-2 size-4" />
                      Mac · Intel (195 MB)
                    </a>
                  </Button>
                  <Button asChild variant="outline">
                    <a href={desktopBundle.url} download>
                      <Download className="mr-2 size-4" />
                      Linux (228 MB)
                    </a>
                  </Button>
                </div>
                <p className="max-w-sm font-mono text-[11px] leading-relaxed uppercase tracking-[0.14em] text-muted-foreground">
                  Unpack, then open “Writing Diagnostic”. On a Mac the first open needs
                  right-click → Open, since the app is not signed by Apple yet.
                </p>
              </div>
            </div>
          </section>
        )}

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* ---- controls ---- */}
          <section className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-6">
            <div className="flex items-center justify-between gap-4">
              <Label className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Source
              </Label>
              <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Batch mode
                <Switch checked={batch} onCheckedChange={setBatch} aria-label="Batch mode" />
              </label>
            </div>

            {batch ? (
              <Textarea
                value={state.urlsRaw}
                onChange={(e) => set("urlsRaw", e.target.value)}
                placeholder={"https://…\nhttps://…\none link per line"}
                rows={7}
                className="mt-3 font-mono text-[13px]"
              />
            ) : (
              <Input
                value={state.urlsRaw}
                onChange={(e) => set("urlsRaw", e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                className="mt-3 h-12 font-mono text-[14px]"
                inputMode="url"
              />
            )}

            {cleaned.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {cleaned.slice(0, 4).map((c) => (
                  <li key={c.original} className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{c.platform}</Badge>
                    {c.changed && <Badge variant="outline">Clean URL</Badge>}
                    <span className="break-all font-mono text-[11px] text-muted-foreground">
                      {c.clean}
                    </span>
                  </li>
                ))}
                {cleaned.length > 4 && (
                  <li className="font-mono text-[11px] text-muted-foreground">
                    +{cleaned.length - 4} more link(s)
                  </li>
                )}
              </ul>
            )}

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Quality preset
                </Label>
                <Select value={state.quality} onValueChange={(v) => set("quality", v)}>
                  <SelectTrigger className="mt-2 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUALITY_PRESETS.map((q) => (
                      <SelectItem key={q.value} value={q.value}>
                        {q.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Container
                </Label>
                <Select value={state.format} onValueChange={(v) => set("format", v)}>
                  <SelectTrigger className="mt-2 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTAINER_FORMATS.filter((f) =>
                      audioMode ? AUDIO_CONTAINERS.has(f.value) : true,
                    ).map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between rounded-xl border border-[color:var(--border-subtle)] px-4 py-3">
              <div>
                <p className="text-[14px]">Audio only</p>
                <p className="text-[12px] text-muted-foreground">
                  Skips video entirely and keeps the highest available bitrate.
                </p>
              </div>
              <Switch
                checked={audioMode}
                onCheckedChange={(v) => {
                  set("audioOnly", v);
                  if (v && !AUDIO_CONTAINERS.has(state.format)) set("format", "mp3");
                  if (!v && state.quality === "audio") set("quality", "best");
                  if (!v && AUDIO_CONTAINERS.has(state.format)) set("format", "mp4");
                }}
                aria-label="Audio only"
              />
            </div>

            <Accordion type="single" collapsible className="mt-4">
              <AccordionItem value="advanced" className="border-[color:var(--border-subtle)]">
                <AccordionTrigger className="font-mono text-[11px] uppercase tracking-[0.18em]">
                  Advanced parameters
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[14px]">Subtitles</p>
                      <p className="text-[12px] text-muted-foreground">
                        Fetch captions and burn them into the file.
                      </p>
                    </div>
                    <Switch
                      checked={state.embedSubtitles}
                      disabled={audioMode}
                      onCheckedChange={(v) => set("embedSubtitles", v)}
                      aria-label="Subtitles"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[14px]">Full playlist</p>
                      <p className="text-[12px] text-muted-foreground">
                        Grab every item when the link points at a playlist.
                      </p>
                    </div>
                    <Switch
                      checked={state.isPlaylist}
                      onCheckedChange={(v) => set("isPlaylist", v)}
                      aria-label="Full playlist"
                    />
                  </div>
                  <div>
                    <Label className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      Browser cookies
                    </Label>
                    <Select
                      value={state.cookiesFromBrowser}
                      onValueChange={(v) => set("cookiesFromBrowser", v)}
                    >
                      <SelectTrigger className="mt-2 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COOKIE_SOURCES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-2 text-[12px] text-muted-foreground">
                      Uses the signed-in session from that browser for private or restricted posts.
                    </p>
                  </div>
                  <div>
                    <Label className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      File naming
                    </Label>
                    <Input
                      value={state.customFilename}
                      onChange={(e) => set("customFilename", e.target.value)}
                      placeholder="%(title)s - %(uploader)s.%(ext)s"
                      className="mt-2 font-mono text-[13px]"
                    />
                  </div>
                  <div>
                    <Label className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      Save to
                    </Label>
                    <div className="mt-2 flex gap-2">
                      <Input
                        value={state.outputDirectory}
                        onChange={(e) => set("outputDirectory", e.target.value)}
                        placeholder="Use Downloads or choose a folder"
                        className="font-mono text-[13px]"
                      />
                      {isDesktop && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          title="Choose save folder"
                          aria-label="Choose save folder"
                          onClick={async () => {
                            const directory = await desktopBridge()?.pickDirectory();
                            if (directory) set("outputDirectory", directory);
                          }}
                        >
                          <FolderOpen className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      Local service address
                    </Label>
                    <Input
                      value={endpoint}
                      onChange={(e) => setEndpoint(e.target.value)}
                      placeholder={DEFAULT_ENDPOINT}
                      className="mt-2 font-mono text-[13px]"
                    />
                    <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                      {serviceReady === null
                        ? "Checking local downloader…"
                        : serviceReady
                          ? "Local downloader connected"
                          : "Local downloader offline — open this page in the desktop app"}
                    </p>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {errors.length > 0 && (
              <div className="mt-4 rounded-xl border border-[color:var(--destructive)] px-4 py-3">
                <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--destructive)]">
                  <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} /> Fix before running
                </p>
                <ul className="mt-2 space-y-1 text-[13px] text-muted-foreground">
                  {errors.map((e) => (
                    <li key={e}>— {e}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button size="lg" className="flex-1" onClick={start} disabled={running}>
                <Download className="mr-2 h-4 w-4" strokeWidth={1.5} />
                {running ? "Working…" : "Start download"}
              </Button>
              {running && (
                <Button size="lg" variant="destructive" onClick={cancel}>
                  <Square className="mr-2 h-4 w-4" strokeWidth={1.5} />
                  Stop
                </Button>
              )}
            </div>

            {preview && (
              <p className="mt-4 break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
                {preview}
              </p>
            )}
          </section>

          {/* ---- console ---- */}
          <section className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                <Terminal className="h-3.5 w-3.5" strokeWidth={1.5} /> Process output
              </p>
              <div className="flex items-center gap-2">
                {running && <Badge variant="secondary">running</Badge>}
                {speed && <Badge variant="outline">{speed}</Badge>}
                {eta && <Badge variant="outline">ETA {eta}</Badge>}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLines([])}
                  disabled={lines.length === 0}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} /> Clear
                </Button>
              </div>
            </div>

            <div className="mt-4">
              <Progress value={percent} />
              <p className="mt-2 text-right font-mono text-[11px] text-muted-foreground">
                {running && percent === 0 ? "Preparing media…" : `${percent.toFixed(0)}%`}
              </p>
            </div>

            <div
              ref={consoleRef}
              className="mt-3 h-[460px] overflow-auto rounded-xl p-4 font-mono text-[12px] leading-relaxed"
              style={{ background: "#0A0A0A", color: "#F4EFE6" }}
            >
              {lines.length === 0 ? (
                <p style={{ color: "rgba(244,239,230,0.45)" }}>
                  Waiting for a job. Output from your local service appears here line by line.
                </p>
              ) : (
                lines.map((l) => (
                  <div
                    key={l.id}
                    className="whitespace-pre-wrap break-all"
                    style={{
                      color:
                        l.kind === "err"
                          ? "#E86A5C"
                          : l.kind === "sys"
                            ? "rgba(244,239,230,0.55)"
                            : "#F4EFE6",
                    }}
                  >
                    {l.text}
                  </div>
                ))
              )}
            </div>

            <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
              This page talks only to the service at your local address. Links and paths are checked
              for shell characters before anything is sent, and the stop button asks the service to
              end the running process.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

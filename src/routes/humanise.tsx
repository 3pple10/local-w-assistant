import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Loader2, RotateCcw, Wand2, X } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { DualGauges } from "@/components/diagnostic/dual-gauges";
import { useLocalLlm } from "@/hooks/use-local-llm";
import { quickScore } from "@/lib/human-signals";

export const Route = createFileRoute("/humanise")({
  head: () => ({
    meta: [
      { title: "Humanise — Rewrite AI-Flagged Sentences On Your Device" },
      {
        name: "description",
        content:
          "Side-by-side humaniser: rewrite a whole draft or one flagged sentence at a time, with live AI-likelihood and human-likelihood scores that update as you edit. Runs entirely in your browser.",
      },
      { property: "og:title", content: "Humanise — Rewrite AI-Flagged Sentences On Your Device" },
      {
        property: "og:description",
        content:
          "Split editor, five rewrite modes and sentence-level accept/reject, scored live by the same AI and human-signal engines as the diagnostic.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HumanisePage,
});

type ModeKey = "light" | "standard" | "aggressive" | "academic" | "casual";

const MODES: { key: ModeKey; label: string; hint: string; temperature: number; brief: string }[] = [
  {
    key: "light",
    label: "Light touch",
    hint: "Minimal edits",
    temperature: 0.5,
    brief:
      "Change as little as possible. Only swap out machine-preferred phrasing and break up the most uniform sentences. Preserve wording everywhere else.",
  },
  {
    key: "standard",
    label: "Standard",
    hint: "Balanced rewrite",
    temperature: 0.7,
    brief:
      "Rewrite naturally: vary sentence length, cut hedging and buzzwords, prefer concrete verbs, allow contractions and the occasional short sentence.",
  },
  {
    key: "aggressive",
    label: "Aggressive",
    hint: "Full re-voicing",
    temperature: 0.9,
    brief:
      "Rewrite freely in a distinctly personal voice: contractions, asides, fragments, direct address, uneven rhythm. Keep every fact and the order of the argument.",
  },
  {
    key: "academic",
    label: "Academic",
    hint: "Formal register",
    temperature: 0.6,
    brief:
      "Keep a formal scholarly register, but remove template phrasing and filler transitions. Precision over flourish; no contractions.",
  },
  {
    key: "casual",
    label: "Casual",
    hint: "Conversational",
    temperature: 0.85,
    brief:
      "Rewrite the way a knowledgeable person would explain it out loud: plain words, contractions, short sentences mixed with longer ones.",
  },
];

const BASE_SYSTEM =
  "You rewrite text so it reads as though a specific person wrote it. Never change the meaning, the facts, " +
  "the numbers or the order of the argument. Never add commentary, headings or quotation marks. " +
  "Return only the rewritten text.";

function splitSentences(text: string) {
  return (text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? []).filter((s) => s.trim().length > 0);
}

function HumanisePage() {
  const llm = useLocalLlm();
  const [draft, setDraft] = useState("");
  const [output, setOutput] = useState("");
  const [mode, setMode] = useState<ModeKey>("standard");
  const [busyAll, setBusyAll] = useState(false);
  const [busySentence, setBusySentence] = useState<number | null>(null);
  const [proposal, setProposal] = useState<{ index: number; text: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const ready = llm.status === "ready" || llm.status === "generating";
  const active = MODES.find((m) => m.key === mode)!;

  const left = useMemo(() => quickScore(draft), [draft]);
  const right = useMemo(() => quickScore(output || draft), [output, draft]);

  const working = output || draft;
  const sentences = useMemo(() => splitSentences(working), [working]);

  useEffect(() => {
    if (!output) setProposal(null);
  }, [output]);

  const systemFor = (m: ModeKey) => `${BASE_SYSTEM} ${MODES.find((x) => x.key === m)!.brief}`;

  const humaniseAll = async () => {
    if (!draft.trim()) return;
    setErr(null);
    setBusyAll(true);
    setOutput("");
    try {
      const final = await llm.generate(
        [
          { role: "system", content: systemFor(mode) },
          { role: "user", content: `Rewrite this passage:\n\n${draft.slice(0, 5000)}` },
        ],
        { onToken: setOutput, maxNewTokens: 1200, temperature: active.temperature },
      );
      setOutput(final.trim());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyAll(false);
    }
  };

  const rewriteSentence = async (index: number) => {
    const sentence = sentences[index];
    if (!sentence) return;
    setErr(null);
    setProposal({ index, text: "" });
    setBusySentence(index);
    const context = working.slice(0, 1200);
    try {
      const final = await llm.generate(
        [
          { role: "system", content: `${systemFor(mode)} Rewrite ONLY the single sentence given.` },
          {
            role: "user",
            content: `Context of the passage (for tone only):\n${context}\n\nRewrite this one sentence:\n${sentence.trim()}`,
          },
        ],
        {
          onToken: (t) => setProposal({ index, text: t }),
          maxNewTokens: 160,
          temperature: active.temperature,
        },
      );
      setProposal({ index, text: final.trim() });
    } catch (e) {
      setErr((e as Error).message);
      setProposal(null);
    } finally {
      setBusySentence(null);
    }
  };

  const accept = () => {
    if (!proposal) return;
    const next = [...sentences];
    const original = next[proposal.index];
    const trailing = original.match(/\s+$/)?.[0] ?? " ";
    next[proposal.index] = proposal.text.trim() + trailing;
    setOutput(next.join(""));
    setProposal(null);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <header className="max-w-2xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Rewrite workspace
          </p>
          <h1 className="mt-2 font-display text-5xl leading-[1.05] sm:text-6xl">Humanise</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            Paste a draft on the left, rewrite it whole or sentence by sentence on the right. Both
            panes are scored live by the same two engines the diagnostic uses — AI likelihood and
            positive human evidence — so you can iterate until the numbers move. The model runs on
            your device; nothing is uploaded.
          </p>
        </header>

        {/* Controls */}
        <section className="mt-8 bg-card p-5" style={{ border: "1px solid #0A0A0A" }}>
          <div className="flex flex-wrap items-center gap-2">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                title={m.hint}
                className={`rounded-full px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors ${
                  mode === m.key
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-foreground/[0.05]"
                }`}
                style={mode === m.key ? undefined : { border: "1px solid rgba(10,10,10,0.2)" }}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{active.brief}</p>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button
              type="button"
              disabled={!ready || busyAll || draft.trim().length < 80}
              onClick={() => void humaniseAll()}
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2 font-mono text-[12px] uppercase tracking-[0.1em] text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busyAll ? (
                <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} aria-hidden />
              ) : (
                <Wand2 className="h-3 w-3" strokeWidth={1.5} aria-hidden />
              )}
              Humanise draft
            </button>
            <button
              type="button"
              onClick={() => {
                setOutput(draft);
                setProposal(null);
              }}
              disabled={!draft.trim()}
              className="inline-flex items-center gap-2 rounded-full px-5 py-2 font-mono text-[12px] uppercase tracking-[0.1em] transition-colors hover:bg-foreground/[0.05] disabled:opacity-40"
              style={{ border: "1px solid #0A0A0A" }}
            >
              <RotateCcw className="h-3 w-3" strokeWidth={1.5} aria-hidden />
              Edit manually
            </button>
            {(busyAll || busySentence !== null) && (
              <button
                type="button"
                onClick={llm.stop}
                className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground hover:text-accent"
              >
                Stop
              </button>
            )}
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {ready ? (llm.modelId?.split("/").pop() ?? "local model") : "no model loaded"}
            </p>
          </div>

          {!ready && (
            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
              Load an on-device model in{" "}
              <Link to="/models" className="underline underline-offset-4">
                model storage
              </Link>{" "}
              first — a general-purpose Qwen rewrites prose better than the coder variants. The
              live score bars below work without any model.
            </p>
          )}
          {err && (
            <p className="mt-3 font-mono text-[12px] leading-relaxed text-accent">{err}</p>
          )}
        </section>

        {/* Split editor */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="bg-card p-6" style={{ border: "1px solid #0A0A0A" }}>
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-2xl">Original</h2>
              <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                {left.words} words
              </p>
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Paste the draft you want to humanise…"
              spellCheck={false}
              className="mt-4 min-h-[360px] w-full resize-y bg-surface p-4 text-[15px] leading-[1.9] outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
              style={{ border: "1px solid rgba(10,10,10,0.12)" }}
            />
            <div className="mt-4">
              <DualGauges ai={draft.trim() ? left.ai : null} human={draft.trim() ? left.human : null} compact />
            </div>
          </section>

          <section className="bg-card p-6" style={{ border: "1px solid #0A0A0A" }}>
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-2xl">Humanised</h2>
              <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                {right.words} words
              </p>
            </div>
            <textarea
              value={output}
              onChange={(e) => setOutput(e.target.value)}
              placeholder="The rewrite appears here — and stays editable."
              spellCheck={false}
              className="mt-4 min-h-[360px] w-full resize-y bg-surface p-4 text-[15px] leading-[1.9] outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
              style={{ border: "1px solid rgba(10,10,10,0.12)" }}
            />
            <div className="mt-4">
              <DualGauges
                ai={working.trim() ? right.ai : null}
                human={working.trim() ? right.human : null}
                markers={right.markers.map((m) => ({ label: m.label, count: m.count }))}
                compact
              />
            </div>
          </section>
        </div>

        {/* Sentence-by-sentence */}
        {sentences.length > 0 && (
          <section className="mt-6 bg-card p-6" style={{ border: "1px solid #0A0A0A" }}>
            <header className="flex flex-wrap items-baseline justify-between gap-3">
              <h3 className="font-display text-2xl">Sentence by sentence</h3>
              <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                {sentences.length} sentences · worst first is usually the fastest win
              </p>
            </header>

            <ul className="mt-5 divide-y" style={{ borderColor: "rgba(10,10,10,0.12)" }}>
              {sentences.map((sentence, i) => {
                const s = quickScore(sentence);
                const flagged = s.ai >= 55 || s.human <= 30;
                return (
                  <li key={i} className="py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p
                        className={`max-w-3xl text-[14.5px] leading-[1.8] ${
                          flagged ? "bg-accent/10 px-1" : ""
                        }`}
                      >
                        {sentence.trim()}
                      </p>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
                          AI {s.ai}
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[hsl(150_45%_28%)]">
                          Human {s.human}
                        </span>
                        <button
                          type="button"
                          disabled={!ready || busySentence !== null || busyAll}
                          onClick={() => void rewriteSentence(i)}
                          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors hover:bg-foreground/[0.05] disabled:cursor-not-allowed disabled:opacity-40"
                          style={{ border: "1px solid rgba(10,10,10,0.25)" }}
                        >
                          {busySentence === i ? (
                            <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} aria-hidden />
                          ) : (
                            <Wand2 className="h-3 w-3" strokeWidth={1.5} aria-hidden />
                          )}
                          Rewrite
                        </button>
                      </div>
                    </div>

                    {proposal?.index === i && (
                      <div
                        className="mt-3 bg-surface p-4"
                        style={{ border: "1px solid rgba(10,10,10,0.12)" }}
                      >
                        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                          Suggested rewrite
                        </p>
                        <p className="mt-2 text-[14.5px] leading-[1.8]">
                          {proposal.text || "…"}
                        </p>
                        {proposal.text && (
                          <div className="mt-3 flex items-center gap-4">
                            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                              AI {quickScore(proposal.text).ai} · Human{" "}
                              {quickScore(proposal.text).human}
                            </span>
                            <button
                              type="button"
                              onClick={accept}
                              disabled={busySentence === i}
                              className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-background transition-opacity hover:opacity-90 disabled:opacity-40"
                            >
                              <Check className="h-3 w-3" strokeWidth={1.5} aria-hidden />
                              Accept
                            </button>
                            <button
                              type="button"
                              onClick={() => setProposal(null)}
                              className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:text-accent"
                            >
                              <X className="h-3 w-3" strokeWidth={1.5} aria-hidden />
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <p className="mt-6 font-mono text-[11px] leading-relaxed text-muted-foreground">
          Live scores are deterministic heuristics, not a detector verdict — use them for drafting
          guidance only, and re-run the full{" "}
          <Link to="/" className="underline underline-offset-4">
            diagnostic
          </Link>{" "}
          when you are done.
        </p>
      </main>
    </div>
  );
}

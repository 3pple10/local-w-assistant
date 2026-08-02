import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { MetricCard } from "@/components/diagnostic/metric-card";
import { SentenceHeatmap } from "@/components/diagnostic/sentence-heatmap";
import { SuggestionList } from "@/components/diagnostic/suggestion-list";
import { ModelLoadingModal } from "@/components/diagnostic/model-loading-modal";
import { useWritingDiagnostic } from "@/hooks/use-writing-diagnostic";

export const Route = createFileRoute("/diagnostic")({
  head: () => ({
    meta: [
      { title: "Writing Diagnostic — Check Your Draft Before You Submit" },
      {
        name: "description",
        content:
          "Run a private, on-device diagnostic on your draft: perplexity, burstiness, AI detection, tone drift and AI-tell phrases. Nothing leaves your browser.",
      },
      { property: "og:title", content: "Writing Diagnostic — Check Your Draft Before You Submit" },
      {
        property: "og:description",
        content:
          "Five local analysis engines score your draft for machine-written patterns. Fully in-browser, no uploads.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DiagnosticPage,
});

const MIN_CHARS = 500;

const CLASSIFICATION: Record<string, string> = {
  likely_human: "Reads human",
  mixed: "Mixed signals",
  likely_ai: "Reads machine-written",
};

function DiagnosticPage() {
  const [text, setText] = useState("");
  const {
    status,
    error,
    result,
    analysisProgress,
    downloadProgress,
    loadedMB,
    totalMB,
    load,
    analyze,
  } = useWritingDiagnostic();

  const chars = text.trim().length;
  const words = useMemo(() => (text.trim().match(/\S+/g) ?? []).length, [text]);
  const tooShort = chars < MIN_CHARS;
  const busy = status === "analyzing";

  const handleClick = () => {
    if (status === "idle" || status === "error") load();
    else if (status === "ready") analyze(text);
  };

  const buttonLabel =
    status === "idle" || status === "error"
      ? "Load analyzer"
      : status === "loading"
        ? "Loading models…"
        : busy
          ? `Analyzing… ${Math.round(analysisProgress * 100)}%`
          : "Analyze draft";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <ModelLoadingModal
        open={status === "loading"}
        progress={downloadProgress}
        loadedMB={loadedMB}
        totalMB={totalMB}
      />

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <header className="max-w-2xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Pre-submission
          </p>
          <h1 className="mt-2 font-display text-5xl leading-[1.05] sm:text-6xl">
            Writing Diagnostic
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            Five analysis engines run entirely inside your browser — perplexity, burstiness,
            a RoBERTa detector, tone drift and an AI-tell scanner. Your draft is never
            uploaded anywhere.
          </p>
        </header>

        {error && (
          <p
            className="mt-8 bg-accent/10 px-4 py-3 font-mono text-[12px] leading-relaxed text-accent"
            style={{ border: "1px solid #8B1A1A" }}
          >
            {error}
          </p>
        )}

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          {/* Left: input */}
          <section className="bg-card p-6" style={{ border: "1px solid #0A0A0A" }}>
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-2xl">Your draft</h2>
              <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                {words} words · {chars} chars
              </p>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste at least 500 characters of your draft here…"
              spellCheck={false}
              className="mt-4 min-h-[420px] w-full resize-y bg-surface p-4 text-[15px] leading-[1.9] outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
              style={{ border: "1px solid rgba(10,10,10,0.12)" }}
            />
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={handleClick}
                disabled={status === "loading" || busy || (status === "ready" && tooShort)}
                className="rounded-full bg-foreground px-6 py-2.5 font-mono text-[12px] uppercase tracking-[0.1em] text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {buttonLabel}
              </button>
              {status === "ready" && tooShort && (
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  {MIN_CHARS - chars} more characters needed
                </p>
              )}
            </div>
          </section>

          {/* Right: metrics */}
          <section className="space-y-4">
            <div className="bg-card p-6" style={{ border: "1px solid #0A0A0A" }}>
              <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                Overall
              </p>
              <p className="mt-2 font-display text-7xl leading-none">
                {result ? result.overall_score : "—"}
                <span className="ml-2 font-mono text-[12px] tracking-[0.1em] text-muted-foreground">
                  /100
                </span>
              </p>
              <p className="mt-3 font-mono text-[12px] uppercase tracking-[0.15em]">
                {result ? (CLASSIFICATION[result.classification] ?? result.classification) : "Awaiting analysis"}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <MetricCard
                label="Perplexity"
                value={result?.perplexity_score ?? 0}
                caption="How unpredictable your word choices are."
              />
              <MetricCard
                label="Burstiness"
                value={result?.burstiness_score ?? 0}
                caption="Variation in sentence length and rhythm."
              />
              <MetricCard
                label="AI detector"
                value={result?.detector_score ?? 0}
                caption="RoBERTa classifier, chunked and confidence-weighted."
              />
              <MetricCard
                label="Tone drift"
                value={result?.tone_drift_score ?? 0}
                caption="Paragraph-to-paragraph voice consistency."
              />
            </div>
          </section>
        </div>

        {result && (
          <div className="mt-6 space-y-6">
            <SentenceHeatmap sentences={result.sentences} />
            <SuggestionList suggestions={result.suggestions} />
          </div>
        )}
      </main>
    </div>
  );
}

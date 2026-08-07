import type { SentenceMetric } from "@/hooks/use-writing-diagnostic";

function toneFor(s: SentenceMetric) {
  const human = s.human_score ?? 50;
  if (s.ai_probability >= 0.7 || s.flags.includes("ai_tell"))
    return "bg-accent/15 border-b-2 border-accent";
  if (human >= 68 && s.ai_probability < 0.45)
    return "bg-[hsl(150_45%_38%/0.12)] border-b-2 border-[hsl(150_45%_32%)]";
  if (s.ai_probability >= 0.45 || s.flags.length)
    return "bg-foreground/[0.07] border-b border-foreground/30";
  return "";
}

export function SentenceHeatmap({ sentences }: { sentences: SentenceMetric[] }) {
  if (!sentences.length) return null;
  const humanCount = sentences.filter(
    (s) => (s.human_score ?? 50) >= 68 && s.ai_probability < 0.45,
  ).length;
  return (
    <section className="bg-card p-6" style={{ border: "1px solid #0A0A0A" }}>
      <header className="flex items-baseline justify-between gap-4">
        <h3 className="font-display text-2xl">Sentence heatmap</h3>
        <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          {sentences.length} sentences · {humanCount} human-marked
        </p>
      </header>
      <p className="mt-4 leading-[2] text-[15px]">
        {sentences.map((s, i) => (
          <span
            key={i}
            title={`AI probability ${(s.ai_probability * 100).toFixed(0)}% · human evidence ${
              s.human_score ?? "—"
            }/100 · perplexity ${s.perplexity}${
              s.flags.length ? ` · ${s.flags.join(", ")}` : ""
            }${s.human_markers?.length ? ` · human: ${s.human_markers.join(", ")}` : ""}`}
            className={`px-0.5 ${toneFor(s)}`}
          >
            {s.text}{" "}
          </span>
        ))}
      </p>
      <div className="mt-6 flex flex-wrap gap-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-6 bg-accent/15 border-b-2 border-accent" /> flagged
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-6 bg-foreground/[0.07] border-b border-foreground/30" />{" "}
          watch
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-6 border-b border-border-subtle" /> clear
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-6 bg-[hsl(150_45%_38%/0.12)] border-b-2 border-[hsl(150_45%_32%)]" />{" "}
          human evidence
        </span>
      </div>
    </section>
  );
}

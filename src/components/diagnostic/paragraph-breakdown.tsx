import type { ParagraphScore } from "@/hooks/use-writing-diagnostic";

function tone(score: number) {
  if (score < 30) return { label: "Flagged", cls: "text-accent", bar: "bg-accent" };
  if (score < 60)
    return { label: "Watch", cls: "text-foreground", bar: "bg-foreground/50" };
  return { label: "Clear", cls: "text-foreground", bar: "bg-foreground" };
}

export function ParagraphBreakdown({
  paragraphs,
  mixedAuthorship,
}: {
  paragraphs: ParagraphScore[];
  mixedAuthorship: boolean;
}) {
  if (!paragraphs.length) return null;
  return (
    <section className="bg-card p-6" style={{ border: "1px solid #0A0A0A" }}>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-display text-2xl">Paragraph breakdown</h3>
        <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          {paragraphs.length} paragraphs · scored in isolation
        </p>
      </header>

      {mixedAuthorship && (
        <p
          className="mt-4 bg-accent/10 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.15em] text-accent"
          style={{ border: "1px solid #8B1A1A" }}
        >
          Mixed Authorship Detected
        </p>
      )}

      <ul className="mt-5 space-y-4">
        {paragraphs.map((p) => {
          const t = tone(p.human_score);
          return (
            <li key={p.index} title={`AI probability ${(p.ai_probability * 100).toFixed(0)}%`}>
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                  ¶{p.index + 1} · {p.words} words{p.is_prose ? "" : " · short"}
                </p>
                <p className={`font-mono text-[11px] uppercase tracking-[0.15em] ${t.cls}`}>
                  {p.human_score}/100 · {t.label}
                </p>
              </div>
              <div className="mt-2 h-[3px] w-full bg-foreground/10">
                <div
                  className={`h-full ${t.bar}`}
                  style={{ width: `${Math.max(2, p.human_score)}%` }}
                />
              </div>
              <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                {p.text}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

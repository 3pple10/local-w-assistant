export function MetricCard({
  label,
  value,
  caption,
  emphasis,
}: {
  label: string;
  value: number | null;
  caption: string;
  emphasis?: boolean;
}) {
  const empty = value === null;
  const v = value ?? 0;
  const tone =
    empty
      ? { text: "text-muted-foreground", bar: "bg-foreground/20", word: "—" }
      : v < 50
      ? { text: "text-accent", bar: "bg-accent", word: "Weak" }
      : v < 75
        ? { text: "text-foreground", bar: "bg-foreground/50", word: "Mixed" }
        : { text: "text-foreground", bar: "bg-foreground", word: "Strong" };

  return (
    <div
      className="bg-card p-5"
      style={{ border: "1px solid #0A0A0A" }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          {tone.word}
        </p>
      </div>
      <p className={`mt-2 font-display leading-none ${tone.text} ${emphasis ? "text-6xl" : "text-5xl"}`}>
        {empty ? "—" : Math.round(v)}
        <span className="ml-1 font-mono text-[12px] tracking-[0.1em] text-muted-foreground">
          /100
        </span>
      </p>
      <div className="mt-4 h-[3px] w-full bg-foreground/10">
        <div className={`h-full ${tone.bar}`} style={{ width: `${empty ? 0 : Math.max(2, v)}%` }} />
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{caption}</p>
    </div>
  );
}

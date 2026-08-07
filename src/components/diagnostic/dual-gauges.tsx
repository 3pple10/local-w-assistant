/**
 * Two independent gauges: how much the text smells machine-written, and how much
 * positive evidence there is that a person wrote it. They do not sum to 100 —
 * flat, marker-free prose can score low on both.
 */
export function DualGauges({
  ai,
  human,
  markers,
  compact,
}: {
  ai: number | null;
  human: number | null;
  markers?: { label: string; count: number }[];
  compact?: boolean;
}) {
  return (
    <div className="bg-card p-5" style={{ border: "1px solid #0A0A0A" }}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          AI vs human signal
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          independent scales
        </p>
      </div>

      <Gauge
        label="AI likelihood"
        value={ai}
        bar="bg-accent"
        text="text-accent"
        compact={compact}
      />
      <Gauge
        label="Human likelihood"
        value={human}
        bar="bg-[hsl(150_45%_32%)]"
        text="text-[hsl(150_45%_28%)]"
        compact={compact}
      />

      {markers && markers.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {markers.slice(0, 6).map((m) => (
            <span
              key={m.label}
              className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
              style={{ border: "1px solid rgba(10,10,10,0.15)", padding: "2px 6px" }}
            >
              {m.label} ×{m.count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Gauge({
  label,
  value,
  bar,
  text,
  compact,
}: {
  label: string;
  value: number | null;
  bar: string;
  text: string;
  compact?: boolean;
}) {
  const empty = value === null || Number.isNaN(value);
  const v = empty ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em]">{label}</p>
        <p className={`font-display ${compact ? "text-2xl" : "text-3xl"} leading-none ${text}`}>
          {empty ? "—" : Math.round(v)}
          <span className="ml-1 font-mono text-[11px] tracking-[0.1em] text-muted-foreground">
            /100
          </span>
        </p>
      </div>
      <div className="mt-2 h-[3px] w-full bg-foreground/10">
        <div
          className={`h-full transition-[width] duration-300 ${bar}`}
          style={{ width: `${empty ? 0 : Math.max(2, v)}%` }}
        />
      </div>
    </div>
  );
}

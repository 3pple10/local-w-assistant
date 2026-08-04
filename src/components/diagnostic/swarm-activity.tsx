import type { LayerEvent } from "@/hooks/use-writing-diagnostic";

export function SwarmActivity({
  layers,
  overrides,
}: {
  layers: LayerEvent[];
  overrides: string[];
}) {
  if (!layers?.length) return null;
  return (
    <section className="bg-card p-6" style={{ border: "1px solid #0A0A0A" }}>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-display text-2xl">Swarm activity</h3>
        <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          {layers.filter((l) => l.fired).length}/{layers.length} layers fired
        </p>
      </header>

      <ul className="mt-5 space-y-4">
        {layers.map((l) => (
          <li key={l.layer} className="grid gap-1 sm:grid-cols-[110px_minmax(0,1fr)]">
            <p
              className={`font-mono text-[11px] uppercase tracking-[0.15em] ${
                l.fired ? "text-accent" : "text-muted-foreground"
              }`}
            >
              {l.layer} · {l.fired ? "fired" : "quiet"}
            </p>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.15em]">
                {l.name}{" "}
                <span className="text-muted-foreground">[{l.size}]</span>
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{l.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      {overrides?.length > 0 && (
        <div className="mt-6 border-t pt-4" style={{ borderColor: "rgba(10,10,10,0.12)" }}>
          <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            Arbitration notes
          </p>
          <ul className="mt-2 space-y-1.5">
            {overrides.map((o, i) => (
              <li key={i} className="text-[13px] leading-relaxed">
                {o}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-6 font-mono text-[11px] leading-relaxed text-muted-foreground">
        Browser analysis is approximate — use for drafting guidance only.
      </p>
    </section>
  );
}

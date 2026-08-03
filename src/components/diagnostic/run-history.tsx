import { formatWhen, type SavedRun } from "@/lib/diagnostic-history";
import { Trash2 } from "lucide-react";

export function RunHistory({
  runs,
  activeId,
  onOpen,
  onDelete,
  onClear,
}: {
  runs: SavedRun[];
  activeId: string | null;
  onOpen: (run: SavedRun) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <section className="bg-card" style={{ border: "1px solid #0A0A0A" }}>
      <header className="flex items-baseline justify-between gap-3 px-6 pt-6">
        <h3 className="font-display text-2xl">Saved runs</h3>
        {runs.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:text-accent transition-colors"
          >
            Clear all
          </button>
        )}
      </header>

      {runs.length === 0 ? (
        <p className="px-6 pb-6 pt-3 text-[13px] leading-relaxed text-muted-foreground">
          Analyses you run are saved on this device so you can revisit the draft and its
          scores later.
        </p>
      ) : (
        <ul className="mt-4">
          {runs.map((run) => {
            const active = run.id === activeId;
            return (
              <li
                key={run.id}
                style={{ borderTop: "1px solid rgba(10,10,10,0.12)" }}
                className={active ? "bg-foreground/[0.04]" : ""}
              >
                <div className="flex items-start gap-2 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onOpen(run)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                        {formatWhen(run.createdAt)}
                      </span>
                      <span
                        className={`font-mono text-[11px] tracking-[0.1em] ${
                          run.result.overall_score < 45 ? "text-accent" : "text-foreground"
                        }`}
                      >
                        {run.result.overall_score}/100
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[13px] text-muted-foreground">
                      {run.title}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(run.id)}
                    aria-label="Delete run"
                    className="mt-1 shrink-0 text-muted-foreground hover:text-accent transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

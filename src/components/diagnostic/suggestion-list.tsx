import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Suggestion } from "@/hooks/use-writing-diagnostic";

const severityLabel: Record<string, string> = {
  high: "High priority",
  medium: "Worth fixing",
  low: "Optional",
};

export function SuggestionList({ suggestions }: { suggestions: Suggestion[] }) {
  const [open, setOpen] = useState<number | null>(0);

  if (!suggestions.length) {
    return (
      <section className="bg-card p-6" style={{ border: "1px solid #0A0A0A" }}>
        <h3 className="font-display text-2xl">No revisions flagged</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Every engine came back within human range. Submit with confidence.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-card" style={{ border: "1px solid #0A0A0A" }}>
      <h3 className="px-6 pt-6 font-display text-2xl">Revision notes</h3>
      <ul className="mt-4">
        {suggestions.map((s, i) => {
          const isOpen = open === i;
          return (
            <li key={i} style={{ borderTop: "1px solid rgba(10,10,10,0.12)" }}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left hover:bg-foreground/[0.03] transition-colors"
              >
                <span className="flex items-baseline gap-3">
                  <span
                    className={`font-mono text-[10px] uppercase tracking-[0.15em] ${
                      s.severity === "high" ? "text-accent" : "text-muted-foreground"
                    }`}
                  >
                    {severityLabel[s.severity] ?? s.severity}
                  </span>
                  <span className="font-mono text-[12px] uppercase tracking-[0.12em]">
                    {s.type.replace(/_/g, " ")}
                  </span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  strokeWidth={1.5}
                  aria-hidden
                />
              </button>
              {isOpen && (
                <p className="px-6 pb-5 text-[15px] leading-relaxed text-muted-foreground">
                  {s.message}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

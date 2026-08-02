import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import {
  listDesignVersions,
  type DesignVersionListItem,
} from "@/lib/design-doc.functions";

export const Route = createFileRoute("/design/history")({
  head: () => ({
    meta: [
      { title: "Design history — Brand DNA" },
      { name: "description", content: "Versioned snapshots of the design system." },
    ],
  }),
  component: HistoryPage,
});

const eyebrow = "font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground";
const mono = "font-mono text-[12px] uppercase tracking-[0.12em]";

function HistoryPage() {
  const navigate = useNavigate();
  const list = useServerFn(listDesignVersions);

  const [versions, setVersions] = useState<DesignVersionListItem[]>([]);
  const [aId, setAId] = useState<string>("");
  const [bId, setBId] = useState<string>("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    list()
      .then(({ versions: v }) => {
        setVersions(v);
        if (v.length >= 1) setAId(v[0].id);
        if (v.length >= 2) setBId(v[1].id);
      })
      .finally(() => setBusy(false));
  }, [list]);

  function compare() {
    if (!aId || !bId || aId === bId) return;
    navigate({ to: "/design/history/diff", search: { a: aId, b: bId } });
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex items-baseline justify-between">
          <div>
            <p className={eyebrow}>// design system history</p>
            <h1
              className="mt-2"
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "clamp(48px, 7vw, 80px)",
                lineHeight: 0.95,
                letterSpacing: "-0.02em",
              }}
            >
              History
            </h1>
          </div>
          <Link
            to="/design"
            className={mono + " hover:opacity-70 transition-opacity"}
          >
            ← Back to DESIGN.md
          </Link>
        </div>

        <div className="mt-2" style={{ borderTop: "1px solid rgba(10,10,10,0.25)" }} />

        {/* Compare bar */}
        <div
          className="mt-8 grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto] items-center gap-4 p-6"
          style={{ border: "1px solid #0A0A0A" }}
        >
          <label className="flex flex-col gap-2">
            <span className={eyebrow}>// from</span>
            <select
              value={aId}
              onChange={(e) => setAId(e.target.value)}
              className="bg-transparent font-mono text-[13px] py-2 px-3"
              style={{ border: "1px solid rgba(10,10,10,0.25)" }}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{String(v.version).padStart(2, "0")} —{" "}
                  {v.label ?? new Date(v.created_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          </label>
          <span className="font-mono text-[14px] tracking-[0.2em] text-center">vs</span>
          <label className="flex flex-col gap-2">
            <span className={eyebrow}>// to</span>
            <select
              value={bId}
              onChange={(e) => setBId(e.target.value)}
              className="bg-transparent font-mono text-[13px] py-2 px-3"
              style={{ border: "1px solid rgba(10,10,10,0.25)" }}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{String(v.version).padStart(2, "0")} —{" "}
                  {v.label ?? new Date(v.created_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={compare}
            disabled={!aId || !bId || aId === bId}
            className={mono + " hover:opacity-90 transition-opacity disabled:opacity-30"}
            style={{
              border: "1px solid #0A0A0A",
              padding: "12px 32px",
              backgroundColor: "var(--foreground)",
              color: "var(--background)",
            }}
          >
            [ Diff ]
          </button>
        </div>

        {/* Timeline */}
        <ul className="mt-12" style={{ borderTop: "1px solid rgba(10,10,10,0.25)" }}>
          {busy ? (
            <li className="py-8">
              <p className={eyebrow}>Loading…</p>
            </li>
          ) : versions.length === 0 ? (
            <li className="py-8">
              <p className={eyebrow}>No snapshots yet.</p>
            </li>
          ) : (
            versions.map((v) => (
              <li
                key={v.id}
                className="grid grid-cols-[80px_1fr_auto] items-baseline gap-6 py-6"
                style={{ borderBottom: "1px solid rgba(10,10,10,0.25)" }}
              >
                <span className="font-mono text-[12px] tracking-[0.1em]">
                  v{String(v.version).padStart(2, "0")}.
                </span>
                <div>
                  <p
                    style={{
                      fontFamily: "'Cormorant Garamond', serif",
                      fontSize: "24px",
                      fontWeight: 600,
                      lineHeight: 1.2,
                    }}
                  >
                    {v.label ?? "—"}
                  </p>
                  <p className={eyebrow + " mt-1"}>
                    {new Date(v.created_at).toLocaleString()}
                  </p>
                </div>
                <Link
                  to="/design/history/diff"
                  search={{ a: v.id, b: aId && aId !== v.id ? aId : (versions[1]?.id ?? v.id) }}
                  className={mono + " hover:opacity-70 transition-opacity"}
                >
                  [ View diff →
                </Link>
              </li>
            ))
          )}
        </ul>
      </main>
    </div>
  );
}

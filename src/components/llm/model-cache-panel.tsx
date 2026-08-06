import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import {
  clearAllModelCaches,
  deleteModel,
  formatBytes,
  readCacheReport,
  type CacheReport,
} from "@/lib/model-cache";

export function ModelCachePanel() {
  const [report, setReport] = useState<CacheReport | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    setReport(await readCacheReport());
    setBusy(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="bg-card p-6" style={{ border: "1px solid #0A0A0A" }}>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Local storage
          </p>
          <h2 className="mt-1 font-display text-3xl">Model cache</h2>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground"
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} aria-hidden />
            ) : (
              <RefreshCw className="h-3 w-3" strokeWidth={1.5} aria-hidden />
            )}
            Refresh
          </button>
          <button
            type="button"
            onClick={async () => {
              setBusy(true);
              await clearAllModelCaches();
              await refresh();
            }}
            className="font-mono text-[10px] uppercase tracking-[0.15em] text-accent transition-opacity hover:opacity-70"
          >
            Clear everything
          </button>
        </div>
      </header>

      {report && (
        <p className="mt-4 font-mono text-[12px] text-muted-foreground">
          {formatBytes(report.totalBytes)} in weights ·{" "}
          {report.usedBytes != null ? formatBytes(report.usedBytes) : "—"} total origin usage of{" "}
          {report.quotaBytes != null ? formatBytes(report.quotaBytes) : "—"} quota
        </p>
      )}

      {report && report.models.length === 0 && (
        <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
          Nothing cached yet. Models are written to browser storage the first time they download,
          then reused offline.
        </p>
      )}

      <ul className="mt-5">
        {report?.models.map((m) => (
          <li key={m.repo} className="py-3" style={{ borderTop: "1px solid rgba(10,10,10,0.12)" }}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate font-mono text-[12px]">{m.repo}</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  {m.files.length} file{m.files.length === 1 ? "" : "s"} · {formatBytes(m.bytes)}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Delete ${m.repo}`}
                onClick={async () => {
                  setBusy(true);
                  await deleteModel(m.repo);
                  await refresh();
                }}
                className="shrink-0 text-muted-foreground transition-colors hover:text-accent"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
              </button>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Files
              </summary>
              <ul className="mt-2 space-y-1">
                {m.files.map((f) => (
                  <li
                    key={f.url}
                    className="flex justify-between gap-4 font-mono text-[11px] text-muted-foreground"
                  >
                    <span className="truncate">{f.file}</span>
                    <span className="shrink-0">{formatBytes(f.bytes)}</span>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>

      {report && report.databases.length > 0 && (
        <div className="mt-5 pt-4" style={{ borderTop: "1px solid rgba(10,10,10,0.12)" }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            IndexedDB databases
          </p>
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">
            {report.databases.map((d) => d.name).join(" · ")}
          </p>
        </div>
      )}
    </section>
  );
}

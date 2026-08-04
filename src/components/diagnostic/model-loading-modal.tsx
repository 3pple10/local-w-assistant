import { Progress } from "@/components/ui/progress";

export function ModelLoadingModal({
  open,
  layerName,
  layerSize,
  progress,
  loadedMB,
  totalMB,
}: {
  open: boolean;
  layerName?: string;
  layerSize?: string;
  progress: number;
  loadedMB: number;
  totalMB: number;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm px-4">
      <div
        className="w-full max-w-md bg-card p-8"
        style={{ border: "1px solid #0A0A0A" }}
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Lazy-loaded specialist
        </p>
        <h2 className="mt-2 font-display text-3xl">
          Loading {layerName ?? "analyzer"} ({layerSize ?? "—"})…
        </h2>
        <div className="mt-6">
          <Progress value={progress} className="h-1.5" />
        </div>
        <p className="mt-3 font-mono text-[12px] text-muted-foreground">
          {loadedMB.toFixed(1)}MB / {totalMB ? totalMB.toFixed(1) : "—"}MB
        </p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Cached in your browser after the first download, so it never fetches twice in a
          session. Nothing you write leaves this device.
        </p>
      </div>
    </div>
  );
}

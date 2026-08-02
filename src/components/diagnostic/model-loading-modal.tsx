import { Progress } from "@/components/ui/progress";

export function ModelLoadingModal({
  open,
  progress,
  loadedMB,
  totalMB,
}: {
  open: boolean;
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
          On-device
        </p>
        <h2 className="mt-2 font-display text-3xl">Loading AI Writing Analyzer</h2>
        <div className="mt-6">
          <Progress value={progress} className="h-1.5" />
        </div>
        <p className="mt-3 font-mono text-[12px] text-muted-foreground">
          Downloading model weights… {loadedMB.toFixed(1)}MB / {totalMB ? totalMB.toFixed(1) : "—"}MB
        </p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          This is saved to your browser cache. Next time loads instantly. Nothing you write
          leaves this device.
        </p>
      </div>
    </div>
  );
}

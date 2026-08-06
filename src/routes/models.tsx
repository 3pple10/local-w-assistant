import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { ModelPicker } from "@/components/llm/model-picker";
import { ModelCachePanel } from "@/components/llm/model-cache-panel";

export const Route = createFileRoute("/models")({
  head: () => ({
    meta: [
      { title: "Model Storage — Inspect & Clear On-Device AI Weights" },
      {
        name: "description",
        content:
          "See exactly which AI model files your browser has cached, how much space each one uses, and clear them on demand. Verify whether your device can run a larger coding model before downloading.",
      },
      { property: "og:title", content: "Model Storage — Inspect & Clear On-Device AI Weights" },
      {
        property: "og:description",
        content:
          "Browser-side model cache manager with per-model sizes, one-click eviction and a device capability check for larger local models.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ModelsPage,
});

function ModelsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <header className="max-w-2xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Storage &amp; capability
          </p>
          <h1 className="mt-2 font-display text-5xl leading-[1.05] sm:text-6xl">Model storage</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            Every model this app uses is downloaded once and kept in browser storage. Inspect what is
            cached, delete anything you no longer want, and check whether this device can handle a
            larger coding model before committing to the download.
          </p>
        </header>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <ModelPicker />
          <ModelCachePanel />
        </div>
      </main>
    </div>
  );
}

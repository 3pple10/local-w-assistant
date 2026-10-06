import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/agent")({
  head: () => ({
    meta: [
      { title: "Agent — Build Small Apps on Your Computer" },
      { name: "description", content: "A desktop agent that plans, writes and previews small web apps in a local folder, with a local database." },
      { property: "og:title", content: "Agent — Build Small Apps on Your Computer" },
      { property: "og:description", content: "Plan, write and preview small local web apps with your own model." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AgentPage,
});

function AgentPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Desktop only · in progress</p>
        <h1 className="mt-2 font-display text-5xl leading-none">Agent</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          The app-building agent is being built. It will work only in the desktop app — get it from the{" "}
          <Link to="/fetcher" className="underline underline-offset-4">Fetcher page</Link>.
        </p>
      </main>
    </div>
  );
}

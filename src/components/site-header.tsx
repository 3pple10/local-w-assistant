import { Link } from "@tanstack/react-router";
import { ScanLine } from "lucide-react";

const navLinkClass =
  "inline-flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground transition-colors";

export function SiteHeader() {
  return (
    <header
      className="sticky top-0 z-30 bg-background"
      style={{ borderBottom: "1px solid #0A0A0A" }}
    >
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 truncate font-mono text-[12px] uppercase tracking-[0.2em] text-foreground sm:text-[13px]"
        >
          <ScanLine className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          Writing Diagnostic
        </Link>
        <nav className="flex shrink-0 items-center gap-4 sm:gap-6">
          <Link to="/" className={navLinkClass}>
            Diagnostic
          </Link>
          <Link to="/humanise" className={navLinkClass}>
            Humanise
          </Link>
          <Link to="/chat" className={navLinkClass}>
            Chat
          </Link>
          <Link to="/fetcher" className={navLinkClass}>
            Fetcher
          </Link>
          <Link to="/models" className={navLinkClass}>
            Models
          </Link>
        </nav>
      </div>
    </header>
  );
}

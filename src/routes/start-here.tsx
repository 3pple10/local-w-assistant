import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/start-here")({
  head: () => ({
    meta: [
      { title: "Start Here — Brand Kit" },
      {
        name: "description",
        content:
          "How to use this Brand Kit template: extract any brand from a URL, connect Firecrawl for richer results, and clean up when you're done.",
      },
    ],
  }),
  component: StartHerePage,
});

const CONNECT_FIRECRAWL_PROMPT = `Connect the Firecrawl connector to this project so URL extraction can use it for JS-heavy sites.`;

const REMOVE_PROMPT = `Remove the "Start Here" button from the navbar and delete the /start-here route. Also delete src/components/start-here-button.tsx and src/routes/start-here.tsx. Keep everything else as-is.`;

function StartHerePage() {
  return (
    <div style={{ background: "#F4EFE6", color: "#0A0A0A", minHeight: "100vh" }}>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-24">
        <Eyebrow>// Template guide</Eyebrow>
        <h1
          className="mt-4"
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 300,
            fontSize: "clamp(44px, 6vw, 72px)",
            lineHeight: 1,
            letterSpacing: "-0.01em",
          }}
        >
          Start <em style={{ fontStyle: "italic", fontWeight: 400 }}>here.</em>
        </h1>

        <Divider />

        <Section number="01." title="What this template does">
          <P>
            Paste any company URL. The app extracts the brand's palette,
            typography, voice, and design tokens — and packages them as a
            kit you can browse, share, and export.
          </P>
          <P>
            Recent kits show up on the home page. Open one to see colors,
            fonts, logos, and a generated <Mono>design.md</Mono>.
          </P>
          <P>
            Drop these files into Lovable or your AI agent to use their
            brand.
          </P>
        </Section>

        <Section number="02." title="Optional: Firecrawl connector">
          <FirecrawlCard />
          <P>
            Extraction works without it. Adding Firecrawl gives you
            better results on JavaScript-heavy sites and richer brand data.
          </P>

          <SubHeading>Pricing — mostly free</SubHeading>
          <P>
            Firecrawl gives every new account <strong>500 free credits</strong>{" "}
            on sign-up, no card required. One brand extraction typically uses
            1–5 credits, so casual use rarely leaves the free tier. If you do
            run out, their Hobby plan starts at <strong>$16/mo</strong> for
            3,000 credits — only needed for heavy or commercial use.
          </P>

          <SubHeading>Connecting it</SubHeading>
          <P>
            <strong>If you remixed this template,</strong> Lovable may have
            already linked Firecrawl. If you're not sure, paste this into
            the Lovable chat:
          </P>
          <PromptBlock text={CONNECT_FIRECRAWL_PROMPT} />
          <P style={{ marginTop: 16 }}>
            Lovable will open the connector picker. Pick an existing
            Firecrawl connection or create one. No code changes needed.
          </P>
        </Section>

        <Section number="03." title="When you're done with this guide">
          <P>
            Once you've got your bearings, you can remove the Start Here
            button and this page. Paste this into the Lovable chat:
          </P>
          <PromptBlock text={REMOVE_PROMPT} />
          <P style={{ marginTop: 16, fontSize: 13, color: "rgba(10,10,10,0.6)" }}>
            You can always restore it later by asking Lovable to add a
            Start Here page back.
          </P>
        </Section>

        <Divider />

        <div className="flex items-center justify-between">
          <Link
            to="/"
            style={{
              fontFamily: "'Courier Prime', monospace",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#0A0A0A",
              textDecoration: "none",
              borderBottom: "1px solid #0A0A0A",
              paddingBottom: 2,
            }}
          >
            ← Back to extract
          </Link>
          <span
            style={{
              fontFamily: "'Courier Prime', monospace",
              fontSize: 10,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: "rgba(10,10,10,0.45)",
            }}
          >
            Brand Kit / v1.0
          </span>
        </div>
      </main>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "'Courier Prime', monospace",
        fontSize: 11,
        letterSpacing: "0.28em",
        textTransform: "uppercase",
        color: "rgba(10,10,10,0.55)",
      }}
    >
      {children}
    </div>
  );
}

function Divider() {
  return (
    <hr
      style={{
        border: 0,
        borderTop: "1px solid rgba(10,10,10,0.2)",
        margin: "56px 0",
      }}
    />
  );
}

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: 48 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "56px 1fr",
          gap: 16,
          alignItems: "baseline",
        }}
      >
        <span
          style={{
            fontFamily: "'Courier Prime', monospace",
            fontSize: 11,
            letterSpacing: "0.18em",
            color: "rgba(10,10,10,0.55)",
          }}
        >
          {number}
        </span>
        <h2
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 400,
            fontSize: 28,
            margin: 0,
            lineHeight: 1.15,
          }}
        >
          {title}
        </h2>
      </div>
      <div style={{ marginLeft: 72, marginTop: 16 }}>{children}</div>
    </section>
  );
}

function P({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <p
      style={{
        fontFamily: "'Libre Baskerville', serif",
        fontSize: 15,
        lineHeight: 1.65,
        color: "rgba(10,10,10,0.82)",
        margin: "12px 0",
        ...style,
      }}
    >
      {children}
    </p>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code
      style={{
        fontFamily: "'Courier Prime', monospace",
        fontSize: 13,
        background: "rgba(10,10,10,0.06)",
        padding: "2px 6px",
      }}
    >
      {children}
    </code>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontFamily: "'Courier Prime', monospace",
        fontSize: 11,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: "rgba(10,10,10,0.55)",
        margin: "28px 0 4px",
      }}
    >
      {children}
    </h3>
  );
}

function FirecrawlCard() {
  return (
    <div
      style={{
        marginTop: 8,
        marginBottom: 20,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 16px",
        border: "1px solid rgba(10,10,10,0.2)",
        background: "#F9F6F0",
      }}
    >
      <div
        aria-hidden
        style={{
          width: 36,
          height: 36,
          display: "grid",
          placeItems: "center",
          background: "#0A0A0A",
          color: "#FF6B35",
          fontFamily: "'Courier Prime', monospace",
          fontSize: 20,
          lineHeight: 1,
        }}
      >
        🔥
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 22,
            fontWeight: 600,
            lineHeight: 1,
            color: "#0A0A0A",
          }}
        >
          Firecrawl
        </span>
        <span
          style={{
            fontFamily: "'Courier Prime', monospace",
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(10,10,10,0.55)",
          }}
        >
          Web scraping · 500 free credits
        </span>
      </div>
    </div>
  );
}

function Step({ n, text }: { n: string; text: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "32px 1fr",
        gap: 12,
        padding: "12px 0",
        borderBottom: "1px solid rgba(10,10,10,0.12)",
        alignItems: "baseline",
      }}
    >
      <span
        style={{
          fontFamily: "'Courier Prime', monospace",
          fontSize: 11,
          color: "rgba(10,10,10,0.55)",
          letterSpacing: "0.14em",
        }}
      >
        0{n}
      </span>
      <span
        style={{
          fontFamily: "'Libre Baskerville', serif",
          fontSize: 15,
          lineHeight: 1.55,
          color: "#0A0A0A",
        }}
      >
        {text}
      </span>
    </div>
  );
}

function PromptBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };
  return (
    <div
      style={{
        marginTop: 16,
        border: "1px solid rgba(10,10,10,0.2)",
        background: "#EDE8DE",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 14px",
          borderBottom: "1px solid rgba(10,10,10,0.12)",
          fontFamily: "'Courier Prime', monospace",
          fontSize: 10,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "rgba(10,10,10,0.55)",
        }}
      >
        <span>Prompt — copy into Lovable chat</span>
        <button
          onClick={onCopy}
          aria-label="Copy prompt"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontFamily: "'Courier Prime', monospace",
            fontSize: 10,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: copied ? "#1f6b3a" : "#0A0A0A",
          }}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" strokeWidth={2} /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" strokeWidth={1.5} /> Copy
            </>
          )}
        </button>
      </div>
      <pre
        style={{
          margin: 0,
          padding: "14px 16px",
          fontFamily: "'Courier Prime', monospace",
          fontSize: 13,
          lineHeight: 1.55,
          color: "#0A0A0A",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {text}
      </pre>
    </div>
  );
}
import { useState } from "react";
import { Check, Copy } from "lucide-react";

type Segment = { type: "text" | "code"; content: string; lang?: string };

export function parseSegments(raw: string): Segment[] {
  const segments: Segment[] = [];
  const re = /```([\w+#-]*)\n?([\s\S]*?)(?:```|$)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    if (match.index > last) {
      segments.push({ type: "text", content: raw.slice(last, match.index) });
    }
    segments.push({ type: "code", lang: match[1] || "text", content: match[2] });
    last = re.lastIndex;
  }
  if (last < raw.length) segments.push({ type: "text", content: raw.slice(last) });
  return segments.filter((s) => s.content.trim().length > 0);
}

function CodeBlock({ lang, content }: { lang: string; content: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <figure className="my-3 bg-foreground text-background" style={{ border: "1px solid #0A0A0A" }}>
      <figcaption className="flex items-center justify-between gap-3 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] opacity-60">{lang}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(content);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.15em] opacity-60 transition-opacity hover:opacity-100"
        >
          {copied ? (
            <Check className="h-3 w-3" strokeWidth={1.5} aria-hidden />
          ) : (
            <Copy className="h-3 w-3" strokeWidth={1.5} aria-hidden />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </figcaption>
      <pre className="overflow-x-auto px-3 pb-3 font-mono text-[12.5px] leading-[1.7]">
        <code>{content.replace(/\n$/, "")}</code>
      </pre>
    </figure>
  );
}

export function RichText({ text }: { text: string }) {
  const segments = parseSegments(text);
  if (!segments.length) return null;
  return (
    <div>
      {segments.map((s, i) =>
        s.type === "code" ? (
          <CodeBlock key={i} lang={s.lang ?? "text"} content={s.content} />
        ) : (
          <p key={i} className="whitespace-pre-wrap text-[14.5px] leading-[1.8]">
            {s.content.trim()}
          </p>
        ),
      )}
    </div>
  );
}

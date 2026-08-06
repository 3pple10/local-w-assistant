import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, Paperclip, Send, Square, X } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { ModelPicker } from "@/components/llm/model-picker";
import { RichText } from "@/components/chat/rich-text";
import { useLocalLlm } from "@/hooks/use-local-llm";
import { ingestFile, filesToPromptBlock, type IngestedFile } from "@/lib/file-ingest";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "On-Device Coding Chat — Private Local AI Assistant" },
      {
        name: "description",
        content:
          "Chat with a coding-tuned model that runs entirely in your browser. Attach CSV, Excel, JSON, Python or JavaScript files and get answers with proper code blocks — nothing is uploaded.",
      },
      { property: "og:title", content: "On-Device Coding Chat — Private Local AI Assistant" },
      {
        property: "og:description",
        content:
          "A local Qwen2.5-Coder chat with file uploads, streaming answers and syntax-aware code blocks. Fully offline after the first download.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatPage,
});

type Msg = { role: "user" | "assistant"; content: string; files?: IngestedFile[] };

const SYSTEM =
  "You are a precise, senior software engineer assisting inside a private on-device app. " +
  "Answer concisely. Always wrap code in fenced code blocks with the correct language tag. " +
  "When the user attaches data files, reason over the given contents only.";

function ChatPage() {
  const llm = useLocalLlm();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [attached, setAttached] = useState<IngestedFile[]>([]);
  const [reading, setReading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const ready = llm.status === "ready";
  const busy = llm.status === "generating";

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    if (ready) taRef.current?.focus();
  }, [ready, messages.length]);

  const onFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setReading(true);
    const next: IngestedFile[] = [];
    for (const f of Array.from(list)) next.push(await ingestFile(f));
    setAttached((prev) => [...prev, ...next]);
    setReading(false);
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && !attached.length) || !ready) return;
    const outgoing: Msg = { role: "user", content: text, files: attached };
    const history = [...messages, outgoing];
    setMessages(history);
    setInput("");
    setAttached([]);
    setStreaming("");

    const payload = history.map((m) => ({
      role: m.role,
      content: (m.files?.length ? filesToPromptBlock(m.files) : "") + m.content,
    }));

    try {
      const final = await llm.generate([{ role: "system", content: SYSTEM }, ...payload], {
        onToken: (t) => setStreaming(t),
        maxNewTokens: 768,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: final }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠︎ ${(err as Error).message}` },
      ]);
    } finally {
      setStreaming(null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <header className="max-w-2xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Local coding assistant
          </p>
          <h1 className="mt-2 font-display text-5xl leading-[1.05] sm:text-6xl">Chat</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            A coding-tuned Qwen model running inside this tab. Attach CSV, Excel, JSON, Python or
            JavaScript files and it reads them locally — answers stream back with code in proper
            code blocks. Manage what's stored in{" "}
            <Link to="/models" className="underline underline-offset-4">
              model storage
            </Link>
            .
          </p>
        </header>

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <section className="flex min-h-[620px] flex-col bg-card" style={{ border: "1px solid #0A0A0A" }}>
            <div ref={boxRef} className="flex-1 space-y-6 overflow-y-auto p-6">
              {messages.length === 0 && !streaming && (
                <p className="text-[14px] leading-relaxed text-muted-foreground">
                  {ready
                    ? "Ask anything — refactor a function, explain a stack trace, or drop a spreadsheet and ask for the summary."
                    : "Load a model on the right to start chatting. Everything stays on this device."}
                </p>
              )}

              {messages.map((m, i) => (
                <article key={i}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {m.role === "user" ? "You" : "Assistant"}
                  </p>
                  {m.files?.length ? (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {m.files.map((f) => (
                        <li
                          key={f.name}
                          className="px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground"
                          style={{ border: "1px solid rgba(10,10,10,0.12)" }}
                        >
                          {f.name}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-2">
                    <RichText text={m.content} />
                  </div>
                </article>
              ))}

              {streaming !== null && (
                <article>
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    Assistant
                  </p>
                  <div className="mt-2">
                    {streaming ? (
                      <RichText text={streaming} />
                    ) : (
                      <p className="animate-pulse font-mono text-[12px] text-muted-foreground">
                        Thinking…
                      </p>
                    )}
                  </div>
                </article>
              )}
            </div>

            <div className="p-4" style={{ borderTop: "1px solid rgba(10,10,10,0.12)" }}>
              {attached.length > 0 && (
                <ul className="mb-3 flex flex-wrap gap-2">
                  {attached.map((f) => (
                    <li
                      key={f.name}
                      className="inline-flex items-center gap-2 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em]"
                      style={{ border: "1px solid rgba(10,10,10,0.12)" }}
                    >
                      {f.name}
                      <button
                        type="button"
                        aria-label={`Remove ${f.name}`}
                        onClick={() => setAttached((p) => p.filter((x) => x.name !== f.name))}
                        className="text-muted-foreground hover:text-accent"
                      >
                        <X className="h-3 w-3" strokeWidth={1.5} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <textarea
                ref={taRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={3}
                disabled={!ready && !busy}
                placeholder={ready ? "Ask something, or drop a file…" : "Load a model to begin"}
                className="w-full resize-y bg-surface p-3 text-[14.5px] leading-[1.8] outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring disabled:opacity-50"
                style={{ border: "1px solid rgba(10,10,10,0.12)" }}
              />

              <div className="mt-3 flex items-center justify-between gap-3">
                <label className="inline-flex cursor-pointer items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground">
                  {reading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} aria-hidden />
                  ) : (
                    <Paperclip className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                  )}
                  Attach files
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    accept=".csv,.tsv,.json,.jsonl,.xlsx,.xlsm,.txt,.md,.py,.js,.jsx,.ts,.tsx,.html,.css,.sql,.yml,.yaml,.xml,.log"
                    onChange={(e) => void onFiles(e.target.files)}
                  />
                </label>

                {busy ? (
                  <button
                    type="button"
                    onClick={llm.stop}
                    className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2 font-mono text-[12px] uppercase tracking-[0.1em] text-background"
                  >
                    <Square className="h-3 w-3" strokeWidth={1.5} aria-hidden /> Stop
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void send()}
                    disabled={!ready || (!input.trim() && !attached.length)}
                    className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2 font-mono text-[12px] uppercase tracking-[0.1em] text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Send className="h-3 w-3" strokeWidth={1.5} aria-hidden /> Send
                  </button>
                )}
              </div>
            </div>
          </section>

          <div className="space-y-6">
            <ModelPicker compact />
          </div>
        </div>
      </main>
    </div>
  );
}

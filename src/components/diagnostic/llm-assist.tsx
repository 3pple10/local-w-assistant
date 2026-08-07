import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, Sparkle, UserCheck, Wand2 } from "lucide-react";
import { RichText } from "@/components/chat/rich-text";
import { useLocalLlm } from "@/hooks/use-local-llm";

const DETECT_SYSTEM =
  "You are an AI-text forensics reviewer. Judge whether the passage reads as machine-written. " +
  "Reply with: a verdict line (Likely human / Mixed / Likely AI), a confidence 0-100, then 2-4 short bullets " +
  "citing concrete evidence from the text. No preamble.";

const HUMAN_SYSTEM =
  "You are a human-authorship reviewer. Do NOT look for AI tells. Look only for positive evidence that a " +
  "specific person wrote this: lived detail, personal judgement, contractions, asides, uneven rhythm, opinions, " +
  "idiosyncratic word choice, concrete specifics. Reply with: a Human evidence score 0-100, then 2-4 bullets " +
  "quoting the strongest human moments, then one bullet naming what is missing. No preamble.";

const HUMANISE_SYSTEM =
  "You rewrite text so it reads like a specific human wrote it, without changing meaning, facts or structure of the argument. " +
  "Vary sentence length, cut hedging and buzzwords, prefer concrete verbs, keep the author's register. " +
  "Return only the rewritten text.";

type Mode = "detect" | "human" | "humanise";

const SYSTEMS: Record<Mode, string> = {
  detect: DETECT_SYSTEM,
  human: HUMAN_SYSTEM,
  humanise: HUMANISE_SYSTEM,
};

export function LlmAssist({ text }: { text: string }) {
  const llm = useLocalLlm();
  const [mode, setMode] = useState<Mode | null>(null);
  const [output, setOutput] = useState("");

  const ready = llm.status === "ready";
  const busy = llm.status === "generating";
  const tooShort = text.trim().length < 200;

  const run = async (kind: Mode) => {
    setMode(kind);
    setOutput("");
    const prompt =
      kind === "humanise"
        ? `Rewrite this passage in a natural human voice:\n\n${text.slice(0, 4000)}`
        : kind === "human"
          ? `Find the human evidence in this passage:\n\n${text.slice(0, 6000)}`
          : `Assess this passage:\n\n${text.slice(0, 6000)}`;
    try {
      const final = await llm.generate(
        [
          { role: "system", content: SYSTEMS[kind] },
          { role: "user", content: prompt },
        ],
        {
          onToken: setOutput,
          maxNewTokens: kind === "humanise" ? 900 : 400,
          temperature: kind === "humanise" ? 0.7 : 0.2,
        },
      );
      setOutput(final);
    } catch (err) {
      setOutput(`⚠︎ ${(err as Error).message}`);
    }
  };


  return (
    <section className="bg-card p-6" style={{ border: "1px solid #0A0A0A" }}>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-display text-2xl">Second opinion &amp; humanise</h3>
        <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          {ready ? (llm.modelId?.split("/").pop() ?? "local model") : "model not loaded"}
        </p>
      </header>

      {!ready ? (
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
          Load the on-device coding model in{" "}
          <Link to="/models" className="underline underline-offset-4">
            model storage
          </Link>{" "}
          to get a language-model verdict on your draft and a humanised rewrite. It runs locally, so
          your text still never leaves the browser.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button
            type="button"
            disabled={busy || tooShort}
            onClick={() => void run("detect")}
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2 font-mono text-[12px] uppercase tracking-[0.1em] text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy && mode === "detect" ? (
              <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} aria-hidden />
            ) : (
              <Sparkle className="h-3 w-3" strokeWidth={1.5} aria-hidden />
            )}
            AI verdict
          </button>
          <button
            type="button"
            disabled={busy || tooShort}
            onClick={() => void run("human")}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2 font-mono text-[12px] uppercase tracking-[0.1em] transition-colors hover:bg-foreground/[0.05] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ border: "1px solid #0A0A0A" }}
          >
            {busy && mode === "human" ? (
              <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} aria-hidden />
            ) : (
              <UserCheck className="h-3 w-3" strokeWidth={1.5} aria-hidden />
            )}
            Human evidence
          </button>
          <button
            type="button"
            disabled={busy || tooShort}
            onClick={() => void run("humanise")}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2 font-mono text-[12px] uppercase tracking-[0.1em] transition-colors hover:bg-foreground/[0.05] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ border: "1px solid #0A0A0A" }}
          >
            {busy && mode === "humanise" ? (
              <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} aria-hidden />
            ) : (
              <Wand2 className="h-3 w-3" strokeWidth={1.5} aria-hidden />
            )}
            Humanise draft
          </button>

          {busy && (
            <button
              type="button"
              onClick={llm.stop}
              className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground hover:text-accent"
            >
              Stop
            </button>
          )}
          {tooShort && (
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              Paste more text first
            </p>
          )}
        </div>
      )}

      {output && (
        <div className="mt-5 bg-surface p-4" style={{ border: "1px solid rgba(10,10,10,0.12)" }}>
          <RichText text={output} />
        </div>
      )}

      <p className="mt-5 font-mono text-[11px] leading-relaxed text-muted-foreground">
        A small local model's judgement is indicative, not proof. Use it alongside the swarm scores.
      </p>
    </section>
  );
}

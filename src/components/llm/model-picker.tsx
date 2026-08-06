import { useCallback, useEffect, useState } from "react";
import { Check, Cpu, Loader2, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { LLM_MODELS, findModel } from "@/lib/llm-models";
import { inspectDevice, verifyModel, type DeviceReport, type Verdict } from "@/lib/device-check";
import { useLocalLlm } from "@/hooks/use-local-llm";

export function ModelPicker({ compact = false }: { compact?: boolean }) {
  const [selected, setSelected] = useState(LLM_MODELS[0].id);
  const [report, setReport] = useState<DeviceReport | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [checking, setChecking] = useState(false);
  const llm = useLocalLlm();

  const runCheck = useCallback(
    async (modelId: string) => {
      setChecking(true);
      const r = report ?? (await inspectDevice());
      setReport(r);
      setVerdict(verifyModel(findModel(modelId), r));
      setChecking(false);
    },
    [report],
  );

  useEffect(() => {
    void runCheck(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const model = findModel(selected);
  const isLoaded = llm.status === "ready" && llm.modelId === selected;
  const Icon =
    verdict?.level === "pass" ? ShieldCheck : verdict?.level === "warn" ? TriangleAlert : ShieldAlert;

  return (
    <section className="bg-card p-6" style={{ border: "1px solid #0A0A0A" }}>
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          On-device model
        </p>
        <h2 className="mt-1 font-display text-3xl">Pick a coding model</h2>
        {!compact && (
          <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
            Your device is checked before anything downloads. Weights run entirely in this browser —
            no prompt, file or draft leaves the machine.
          </p>
        )}
      </header>

      <ul className="mt-5 space-y-3">
        {LLM_MODELS.map((m) => {
          const active = m.id === selected;
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setSelected(m.id)}
                className={`w-full p-4 text-left transition-colors ${active ? "bg-foreground/[0.05]" : "hover:bg-foreground/[0.03]"}`}
                style={{ border: active ? "1px solid #0A0A0A" : "1px solid rgba(10,10,10,0.12)" }}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-[12px] uppercase tracking-[0.12em]">
                    {m.label}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {m.params} · ~{m.sizeMB}MB
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{m.blurb}</p>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 p-4" style={{ border: "1px solid rgba(10,10,10,0.12)" }}>
        <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em]">
          {checking ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} aria-hidden />
          ) : (
            <Icon
              className={`h-3.5 w-3.5 ${verdict?.level === "fail" ? "text-accent" : ""}`}
              strokeWidth={1.5}
              aria-hidden
            />
          )}
          {checking
            ? "Verifying device…"
            : verdict?.pass
              ? `Device check passed — will run on ${verdict.device.toUpperCase()}`
              : "Device check failed"}
        </p>
        <ul className="mt-3 space-y-1.5">
          {verdict?.reasons.map((r, i) => (
            <li key={i} className="text-[13px] leading-relaxed text-muted-foreground">
              {r}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          type="button"
          disabled={!verdict?.pass || llm.status === "loading" || isLoaded}
          onClick={() => llm.load(selected, verdict?.device ?? "wasm")}
          className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-2.5 font-mono text-[12px] uppercase tracking-[0.1em] text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {llm.status === "loading" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} aria-hidden />
          ) : isLoaded ? (
            <Check className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          ) : (
            <Cpu className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          )}
          {isLoaded ? "Model ready" : llm.status === "loading" ? "Downloading…" : "Download & run"}
        </button>
        {llm.status === "ready" && (
          <button
            type="button"
            onClick={llm.unload}
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground hover:text-accent"
          >
            Unload from memory
          </button>
        )}
      </div>

      {llm.status === "loading" && (
        <div className="mt-4">
          <Progress value={llm.progress} className="h-1.5" />
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">
            {llm.loadedMB.toFixed(1)}MB / {llm.totalMB ? llm.totalMB.toFixed(1) : "—"}MB ·{" "}
            {model.label}
          </p>
        </div>
      )}

      {llm.error && (
        <p className="mt-4 font-mono text-[12px] leading-relaxed text-accent">{llm.error}</p>
      )}
    </section>
  );
}

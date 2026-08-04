import { useCallback, useEffect, useRef, useState } from "react";

export type SentenceMetric = {
  text: string;
  start: number;
  end: number;
  ai_probability: number;
  perplexity: number;
  flags: string[];
};

export type Suggestion = {
  type: string;
  message: string;
  severity: "low" | "medium" | "high" | string;
};

export type ParagraphScore = {
  index: number;
  text: string;
  start: number;
  end: number;
  words: number;
  ai_probability: number;
  human_score: number;
  is_prose: boolean;
  kind?: string;
  surface_hits?: number;
};


export type LayerEvent = {
  layer: string;
  name: string;
  size: string;
  fired: boolean;
  detail: string;
};

export type DiagnosticResult = {
  overall_score: number;
  classification: "likely_human" | "mixed" | "likely_ai" | "review_needed" | string;
  perplexity_score: number;
  burstiness_score: number;
  detector_score: number;
  tone_drift_score: number;
  author_consistency_score: number;
  mixed_authorship: boolean;
  detector_model?: string;
  paragraphs: ParagraphScore[];
  ai_tells: { phrase: string; count: number }[];
  sentences: SentenceMetric[];
  suggestions: Suggestion[];
  swarm?: LayerEvent[];
  overrides?: string[];
  skipped_sections?: number;
};


type Status = "idle" | "loading" | "ready" | "analyzing" | "error";

type FileProgress = { file: string; loaded: number; total: number; progress: number };

export function useWritingDiagnostic() {
  const workerRef = useRef<Worker | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, FileProgress>>({});
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [result, setResult] = useState<DiagnosticResult | null>(null);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(new URL("../workers/ai.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent) => {
      const { type, data, message } = event.data ?? {};
      if (type === "progress" && data?.file) {
        if (data.status === "progress" || data.status === "done") {
          setFiles((prev) => ({
            ...prev,
            [data.file]: {
              file: data.file,
              loaded: data.loaded ?? prev[data.file]?.total ?? 0,
              total: data.total ?? prev[data.file]?.total ?? 0,
              progress: data.status === "done" ? 100 : (data.progress ?? 0),
            },
          }));
        }
      } else if (type === "ready") {
        setStatus("ready");
      } else if (type === "analysis_progress") {
        setAnalysisProgress(data);
      } else if (type === "result") {
        setResult(data);
        setAnalysisProgress(1);
        setStatus("ready");
      } else if (type === "error") {
        setError(message ?? "Unknown error");
        setStatus("error");
      }
    };
    worker.onerror = (e) => {
      setError(e.message || "Failed to start the local AI worker.");
      setStatus("error");
    };
    workerRef.current = worker;
    return worker;
  }, []);

  const load = useCallback(() => {
    if (status === "loading" || status === "ready" || status === "analyzing") return;
    setError(null);
    setStatus("loading");
    ensureWorker().postMessage({ type: "init" });
  }, [ensureWorker, status]);

  const analyze = useCallback(
    (text: string) => {
      if (status !== "ready") return;
      setResult(null);
      setAnalysisProgress(0);
      setStatus("analyzing");
      ensureWorker().postMessage({ type: "analyze", text });
    },
    [ensureWorker, status],
  );

  const list = Object.values(files);
  const loadedBytes = list.reduce((s, f) => s + f.loaded, 0);
  const totalBytes = list.reduce((s, f) => s + f.total, 0);
  const downloadProgress = totalBytes ? Math.min(100, (loadedBytes / totalBytes) * 100) : 0;

  return {
    status,
    error,
    result,
    analysisProgress,
    downloadProgress,
    loadedMB: loadedBytes / 1024 / 1024,
    totalMB: totalBytes / 1024 / 1024,
    load,
    analyze,
  };
}

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_LLM } from "@/lib/llm-models";

export type LlmStatus = "idle" | "loading" | "ready" | "generating" | "error";

type FileProgress = { file: string; loaded: number; total: number };

type Store = {
  worker: Worker | null;
  status: LlmStatus;
  modelId: string | null;
  device: "webgpu" | "wasm" | null;
  error: string | null;
  files: Record<string, FileProgress>;
};

/** Module-level so the loaded model is shared by every page in the session. */
const store: Store = {
  worker: null,
  status: "idle",
  modelId: null,
  device: null,
  error: null,
  files: {},
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

type Pending = {
  onToken: (t: string) => void;
  resolve: (text: string) => void;
  reject: (e: Error) => void;
  buffer: string;
};
const pending = new Map<string, Pending>();

function ensureWorker() {
  if (store.worker) return store.worker;
  const worker = new Worker(new URL("../workers/llm.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (e: MessageEvent) => {
    const { type, id, text, message, data, modelId, device } = e.data ?? {};
    if (type === "loading") {
      store.status = "loading";
      store.files = {};
      store.error = null;
    } else if (type === "progress" && data?.file) {
      if (data.status === "progress" || data.status === "done") {
        store.files = {
          ...store.files,
          [data.file]: {
            file: data.file,
            loaded: data.loaded ?? store.files[data.file]?.total ?? 0,
            total: data.total ?? store.files[data.file]?.total ?? 0,
          },
        };
      }
    } else if (type === "ready") {
      store.status = "ready";
      store.modelId = modelId;
      store.device = device;
    } else if (type === "token") {
      const p = pending.get(id);
      if (p) {
        p.buffer += text;
        p.onToken(p.buffer);
      }
      return;
    } else if (type === "done") {
      const p = pending.get(id);
      pending.delete(id);
      store.status = pending.size ? "generating" : "ready";
      p?.resolve(text || p.buffer);
    } else if (type === "error") {
      if (id && pending.has(id)) {
        const p = pending.get(id)!;
        pending.delete(id);
        p.reject(new Error(message));
        store.status = pending.size ? "generating" : "ready";
      } else {
        store.status = "error";
        store.error = message ?? "Local model error.";
      }
    }
    emit();
  };
  worker.onerror = (e) => {
    store.status = "error";
    store.error = e.message || "Failed to start the local model worker.";
    emit();
  };
  store.worker = worker;
  return worker;
}

export function useLocalLlm() {
  const [, force] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const l = () => mounted.current && force((n) => n + 1);
    listeners.add(l);
    return () => {
      mounted.current = false;
      listeners.delete(l);
    };
  }, []);

  const load = useCallback((modelId: string = DEFAULT_LLM, device: "webgpu" | "wasm" = "webgpu") => {
    if (store.status === "loading") return;
    store.status = "loading";
    store.error = null;
    store.files = {};
    emit();
    ensureWorker().postMessage({ type: "load", modelId, device });
  }, []);

  const generate = useCallback(
    (
      messages: { role: string; content: string }[],
      opts: { onToken?: (t: string) => void; maxNewTokens?: number; temperature?: number } = {},
    ) => {
      if (store.status !== "ready" && store.status !== "generating") {
        return Promise.reject(new Error("Load a local model first."));
      }
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      store.status = "generating";
      emit();
      return new Promise<string>((resolve, reject) => {
        pending.set(id, {
          onToken: opts.onToken ?? (() => {}),
          resolve,
          reject,
          buffer: "",
        });
        ensureWorker().postMessage({
          type: "generate",
          id,
          messages,
          maxNewTokens: opts.maxNewTokens,
          temperature: opts.temperature,
        });
      });
    },
    [],
  );

  const stop = useCallback(() => {
    store.worker?.postMessage({ type: "stop" });
  }, []);

  const unload = useCallback(() => {
    store.worker?.terminate();
    store.worker = null;
    store.status = "idle";
    store.modelId = null;
    store.device = null;
    store.files = {};
    emit();
  }, []);

  const list = Object.values(store.files);
  const loaded = list.reduce((s, f) => s + f.loaded, 0);
  const total = list.reduce((s, f) => s + f.total, 0);

  return {
    status: store.status,
    modelId: store.modelId,
    device: store.device,
    error: store.error,
    progress: total ? Math.min(100, (loaded / total) * 100) : 0,
    loadedMB: loaded / 1024 / 1024,
    totalMB: total / 1024 / 1024,
    load,
    generate,
    stop,
    unload,
  };
}

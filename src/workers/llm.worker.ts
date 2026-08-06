/// <reference lib="webworker" />
/**
 * On-device coding LLM worker (transformers.js).
 * Handles chat, AI-detection second opinions and humanisation for the
 * diagnostic page. Weights are cached by the browser after the first load.
 */
import {
  pipeline,
  TextStreamer,
  InterruptableStoppingCriteria,
  env,
} from "@huggingface/transformers";

env.allowLocalModels = false;

type LoadMsg = { type: "load"; modelId: string; device: "webgpu" | "wasm" };
type GenerateMsg = {
  type: "generate";
  id: string;
  messages: { role: string; content: string }[];
  maxNewTokens?: number;
  temperature?: number;
};
type Incoming = LoadMsg | GenerateMsg | { type: "stop" } | { type: "dispose" };

const post = (msg: unknown) => (self as unknown as Worker).postMessage(msg);

let generator: any = null;
let loadedId: string | null = null;
let stopper: any = null;

async function load({ modelId, device }: LoadMsg) {
  if (loadedId === modelId && generator) {
    post({ type: "ready", modelId, device });
    return;
  }
  generator = null;
  loadedId = null;
  post({ type: "loading", modelId });

  const attempts: { device: "webgpu" | "wasm"; dtype: string }[] =
    device === "webgpu"
      ? [
          { device: "webgpu", dtype: "q4f16" },
          { device: "webgpu", dtype: "q4" },
          { device: "wasm", dtype: "q4" },
        ]
      : [{ device: "wasm", dtype: "q4" }];

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      generator = await pipeline("text-generation", modelId, {
        device: attempt.device,
        dtype: attempt.dtype as any,
        progress_callback: (p: any) => post({ type: "progress", data: p }),
      });
      loadedId = modelId;
      post({ type: "ready", modelId, device: attempt.device });
      return;
    } catch (err) {
      lastError = err;
    }
  }
  post({
    type: "error",
    message:
      (lastError as Error)?.message ??
      "Could not load the model on this device. Try a smaller model or clear the model cache.",
  });
}

async function generate({ id, messages, maxNewTokens, temperature }: GenerateMsg) {
  if (!generator) {
    post({ type: "error", id, message: "No model is loaded yet." });
    return;
  }
  try {
    stopper = new InterruptableStoppingCriteria();
  } catch {
    stopper = null;
  }

  const tokenizer = generator.tokenizer;
  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text: string) => post({ type: "token", id, text }),
  });

  try {
    const output = await generator(messages, {
      max_new_tokens: maxNewTokens ?? 512,
      do_sample: (temperature ?? 0.4) > 0,
      temperature: temperature ?? 0.4,
      top_p: 0.9,
      repetition_penalty: 1.05,
      streamer,
      ...(stopper ? { stopping_criteria: stopper } : {}),
    });
    const last = output?.[0]?.generated_text;
    const text = Array.isArray(last) ? (last[last.length - 1]?.content ?? "") : String(last ?? "");
    post({ type: "done", id, text });
  } catch (err) {
    post({ type: "error", id, message: (err as Error)?.message ?? "Generation failed." });
  } finally {
    stopper = null;
  }
}

self.addEventListener("message", (event: MessageEvent<Incoming>) => {
  const msg = event.data;
  if (msg.type === "load") void load(msg);
  else if (msg.type === "generate") void generate(msg);
  else if (msg.type === "stop") stopper?.interrupt?.();
  else if (msg.type === "dispose") {
    generator = null;
    loadedId = null;
  }
});

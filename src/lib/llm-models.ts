export type LlmModel = {
  id: string;
  label: string;
  params: string;
  /** Approximate download size in MB for the quantization we request. */
  sizeMB: number;
  /** Minimum device score (see device-check) required to pass verification. */
  minRamGB: number;
  requiresWebGPU: boolean;
  blurb: string;
};

/**
 * Coding-tuned instruct models, small enough to run fully in the browser
 * through transformers.js (WebGPU preferred, WASM fallback).
 */
export const LLM_MODELS: LlmModel[] = [
  {
    id: "onnx-community/Qwen2.5-Coder-1.5B-Instruct",
    label: "Qwen2.5 Coder 1.5B Instruct",
    params: "1.5B",
    sizeMB: 1100,
    minRamGB: 8,
    requiresWebGPU: true,
    blurb:
      "Fine-tuned for code generation, review and explanation. Best answers, heaviest download — needs WebGPU and a roomy device.",
  },
  {
    id: "onnx-community/Qwen2.5-Coder-0.5B-Instruct",
    label: "Qwen2.5 Coder 0.5B Instruct",
    params: "0.5B",
    sizeMB: 400,
    minRamGB: 4,
    requiresWebGPU: false,
    blurb:
      "Same coding-tuned family, a third of the size. Runs on WASM when WebGPU is unavailable.",
  },
];

export const DEFAULT_LLM = LLM_MODELS[1].id;

export function findModel(id: string) {
  return LLM_MODELS.find((m) => m.id === id) ?? LLM_MODELS[1];
}

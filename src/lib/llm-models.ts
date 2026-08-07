export type LlmModel = {
  id: string;
  label: string;
  params: string;
  /** "coder" is tuned for code; "general" writes better prose (humanising). */
  kind: "coder" | "general";
  /** Approximate download size in MB for the quantization we request. */
  sizeMB: number;
  /** Minimum device score (see device-check) required to pass verification. */
  minRamGB: number;
  requiresWebGPU: boolean;
  blurb: string;
};

/**
 * Instruct models small enough to run fully in the browser through
 * transformers.js (WebGPU preferred, WASM fallback). Ordered light → heavy.
 */
export const LLM_MODELS: LlmModel[] = [
  {
    id: "onnx-community/Qwen2.5-Coder-0.5B-Instruct",
    label: "Qwen2.5 Coder 0.5B Instruct",
    params: "0.5B",
    kind: "coder",
    sizeMB: 400,
    minRamGB: 4,
    requiresWebGPU: false,
    blurb:
      "Smallest coding-tuned option. Runs on WASM when WebGPU is unavailable — the safe default on laptops and phones.",
  },
  {
    id: "onnx-community/Qwen2.5-Coder-1.5B-Instruct",
    label: "Qwen2.5 Coder 1.5B Instruct",
    params: "1.5B",
    kind: "coder",
    sizeMB: 1100,
    minRamGB: 8,
    requiresWebGPU: true,
    blurb:
      "Fine-tuned for code generation, review and explanation. Solid quality per megabyte — needs WebGPU.",
  },
  {
    id: "onnx-community/Qwen2.5-1.5B-Instruct",
    label: "Qwen2.5 1.5B Instruct (general)",
    params: "1.5B",
    kind: "general",
    sizeMB: 1050,
    minRamGB: 8,
    requiresWebGPU: true,
    blurb:
      "General-purpose sibling of the coder 1.5B. Noticeably better at rewriting prose, so prefer it for humanising.",
  },
  {
    id: "onnx-community/Qwen2.5-Coder-3B-Instruct",
    label: "Qwen2.5 Coder 3B Instruct",
    params: "3B",
    kind: "coder",
    sizeMB: 1950,
    minRamGB: 10,
    requiresWebGPU: true,
    blurb:
      "The quality jump for coding work: multi-file reasoning and longer explanations. ~2GB download, WebGPU only.",
  },
  {
    id: "onnx-community/Qwen3-4B-Instruct-2507-ONNX",
    label: "Qwen3 4B Instruct",
    params: "4B",
    kind: "general",
    sizeMB: 2500,
    minRamGB: 12,
    requiresWebGPU: true,
    blurb:
      "Newer generation, strong at both code and prose. Replaces Qwen2.5 3B general, which has no browser-runnable build.",
  },
  {
    id: "onnx-community/Qwen3-8B-ONNX",
    label: "Qwen3 8B",
    params: "8B",
    kind: "general",
    sizeMB: 5200,
    minRamGB: 16,
    requiresWebGPU: true,
    blurb:
      "Heaviest tier — desktop-class GPUs only. Stands in for Qwen2.5 Coder 7B, which is not published in a browser ONNX build.",
  },
];

export const DEFAULT_LLM = LLM_MODELS[0].id;

export function findModel(id: string) {
  return LLM_MODELS.find((m) => m.id === id) ?? LLM_MODELS[0];
}

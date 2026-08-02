/// <reference lib="webworker" />
import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;
env.useBrowserCache = true;

let aiDetector: any = null;
let embedder: any = null;

const AI_TELLS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bIn conclusion[;,]?\s/gi, label: "In conclusion" },
  { pattern: /\bTo summarize[;,]?\s/gi, label: "To summarize" },
  {
    pattern: /\b(it is important to note that|it should be noted that)\b/gi,
    label: "hedging filler",
  },
  {
    pattern: /\b(delve into|leverage|utilize|paradigm|synergy|holistic|robust)\b/gi,
    label: "LLM vocabulary",
  },
  {
    pattern: /\b(First and foremost|Secondly|Thirdly|Lastly|Finally)[;,]?\s/gi,
    label: "mechanical connective",
  },
];

const post = (msg: unknown) => (self as unknown as Worker).postMessage(msg);

async function loadPipeline(task: any, model: string, report: boolean) {
  const progress_callback = report
    ? (x: any) => post({ type: "progress", data: x })
    : undefined;
  try {
    return await pipeline(task, model, { device: "webgpu", progress_callback } as any);
  } catch {
    return await pipeline(task, model, { device: "wasm", progress_callback } as any);
  }
}

self.onmessage = async (event: MessageEvent) => {
  const { type, text } = event.data ?? {};

  if (type === "init") {
    try {
      if (!aiDetector) {
        aiDetector = await loadPipeline(
          "text-classification",
          "Xenova/roberta-base-openai-detector",
          true,
        );
      }
      if (!embedder) {
        embedder = await loadPipeline(
          "feature-extraction",
          "Xenova/all-MiniLM-L6-v2",
          true,
        );
      }
      post({ type: "ready" });
    } catch (err) {
      post({
        type: "error",
        message:
          "Your browser doesn't support local AI analysis. Try Chrome or Edge on desktop. (" +
          (err as Error).message +
          ")",
      });
    }
    return;
  }

  if (type === "analyze" && typeof text === "string") {
    try {
      post({ type: "result", data: await analyzeDocument(text) });
    } catch (err) {
      post({ type: "error", message: (err as Error).message });
    }
  }
};

/* ---------------- pure-JS math engines ---------------- */

function tokenize(text: string) {
  return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

/** n-gram entropy based perplexity proxy (0-100, higher = more human) */
function perplexityEngine(text: string) {
  const tokens = tokenize(text);
  if (tokens.length < 5) return 50;
  const uni = new Map<string, number>();
  const bi = new Map<string, number>();
  tokens.forEach((t, i) => {
    uni.set(t, (uni.get(t) ?? 0) + 1);
    if (i > 0) {
      const k = tokens[i - 1] + " " + t;
      bi.set(k, (bi.get(k) ?? 0) + 1);
    }
  });
  let entropy = 0;
  for (const [, c] of uni) {
    const p = c / tokens.length;
    entropy -= p * Math.log2(p);
  }
  const maxEntropy = Math.log2(uni.size || 2);
  const normalized = maxEntropy > 0 ? entropy / maxEntropy : 0.5;
  const repeatRatio = 1 - bi.size / Math.max(1, tokens.length - 1);
  const score = normalized * 100 - repeatRatio * 35;
  return clamp(score);
}

function sentenceSplit(text: string) {
  return (text.match(/[^.!?]+[.!?]+/g) ?? [text]).filter((s) => s.trim().length > 0);
}

/** length CV + punctuation rhythm + clause-depth variance */
function burstinessEngine(sentences: string[]) {
  if (sentences.length < 2) return 40;
  const lengths = sentences.map((s) => tokenize(s).length || 1);
  const cv = coefficientOfVariation(lengths);

  const commas = sentences.map((s) => (s.match(/[,;:—-]/g) ?? []).length);
  const punctCv = coefficientOfVariation(commas.map((c) => c + 1));

  const depth = sentences.map(
    (s) => (s.match(/\b(that|which|because|although|while|whereas|if|when)\b/gi) ?? []).length + 1,
  );
  const depthCv = coefficientOfVariation(depth);

  return clamp((cv * 1.6 + punctCv * 0.8 + depthCv * 0.6) * 100 * 0.45);
}

function coefficientOfVariation(values: number[]) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (!mean) return 0;
  const sd = Math.sqrt(
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length,
  );
  return sd / mean;
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, n));
}

function chunkText(text: string, size: number, overlap: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let start = 0;
  while (start < words.length) {
    chunks.push(words.slice(start, start + size).join(" "));
    if (start + size >= words.length) break;
    start += size - overlap;
  }
  return chunks.length ? chunks : [text];
}

function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>) {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

async function analyzeDocument(text: string) {
  const sentences = sentenceSplit(text);

  /* --- AI detector on overlapping chunks --- */
  const chunks = chunkText(text, 380, 96);
  const chunkResults: { p: number; w: number }[] = [];
  for (const chunk of chunks) {
    const output: any = await aiDetector(chunk, { top_k: 2 });
    const arr = Array.isArray(output) ? output.flat() : [output];
    const fake = arr.find((x: any) => /fake|ai|machine|label_1/i.test(x.label));
    const p = fake?.score ?? 0.5;
    chunkResults.push({ p, w: Math.max(0.05, Math.abs(p - 0.5) * 2) });
    post({ type: "analysis_progress", data: chunkResults.length / chunks.length });
  }
  const totalW = chunkResults.reduce((s, r) => s + r.w, 0) || 1;
  const avgAiProb = chunkResults.reduce((s, r) => s + r.p * r.w, 0) / totalW;

  /* --- sentence level --- */
  let cursor = 0;
  const sentenceMetrics = sentences.slice(0, 200).map((sent) => {
    const start = text.indexOf(sent, cursor);
    cursor = start >= 0 ? start + sent.length : cursor;
    const flags: string[] = [];
    for (const { pattern } of AI_TELLS) {
      pattern.lastIndex = 0;
      if (pattern.test(sent)) {
        flags.push("ai_tell");
        break;
      }
    }
    const perplexity = perplexityEngine(sent) / 4 + 5;
    if (perplexity < 15) flags.push("low_perplexity");
    const words = tokenize(sent).length;
    if (words > 34) flags.push("long_sentence");
    const localProb = clamp(avgAiProb * 100 + (flags.includes("ai_tell") ? 12 : 0)) / 100;
    return {
      text: sent.trim(),
      start: Math.max(0, start),
      end: Math.max(0, start) + sent.length,
      ai_probability: Math.round(localProb * 100) / 100,
      perplexity: Math.round(perplexity * 10) / 10,
      flags,
    };
  });

  /* --- tone drift via MiniLM paragraph embeddings --- */
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 40);
  let toneDrift = 65;
  if (paragraphs.length >= 2 && embedder) {
    const embs: Float32Array[] = [];
    for (const p of paragraphs.slice(0, 8)) {
      const out: any = await embedder(p, { pooling: "mean", normalize: true });
      embs.push(out.data);
    }
    const sims: number[] = [];
    for (let i = 1; i < embs.length; i++) sims.push(cosineSimilarity(embs[i - 1], embs[i]));
    const mean = sims.reduce((a, b) => a + b, 0) / (sims.length || 1);
    // unnatural uniformity (very high similarity) is penalised, as is chaotic drift
    toneDrift = clamp(100 - Math.abs(mean - 0.62) * 190);
  }

  /* --- AI tell scan --- */
  const tells: { phrase: string; count: number }[] = [];
  for (const { pattern, label } of AI_TELLS) {
    pattern.lastIndex = 0;
    const matches = text.match(pattern);
    if (matches?.length) tells.push({ phrase: label, count: matches.length });
  }

  const perplexity_score = Math.round(perplexityEngine(text));
  const burstiness_score = Math.round(burstinessEngine(sentences));
  const detector_score = Math.round((1 - avgAiProb) * 100);
  const tone_drift_score = Math.round(toneDrift);

  const suggestions: { type: string; message: string; severity: string }[] = [];
  if (burstiness_score < 50)
    suggestions.push({
      type: "burstiness",
      message:
        "Sentence lengths are too uniform. Break one long sentence into two, and let another run long — human writing swings.",
      severity: burstiness_score < 35 ? "high" : "medium",
    });
  if (perplexity_score < 55)
    suggestions.push({
      type: "perplexity",
      message:
        "Word choice is highly predictable. Replace generic verbs with specific ones and add concrete nouns from your own experience.",
      severity: "medium",
    });
  if (detector_score < 60)
    suggestions.push({
      type: "detector",
      message:
        "The classifier leans machine-written. Add a personal example, an aside, or an unconventional phrasing to break the pattern.",
      severity: detector_score < 40 ? "high" : "medium",
    });
  if (tone_drift_score < 55)
    suggestions.push({
      type: "tone_drift",
      message:
        "Paragraph-to-paragraph voice is unnaturally uniform. Vary register: a shorter, blunter paragraph in the middle helps.",
      severity: "low",
    });
  if (tells.length)
    suggestions.push({
      type: "ai_tells",
      message:
        "Found telltale phrasing: " +
        tells.map((t) => `${t.phrase} (${t.count})`).join(", ") +
        ". Rewrite these in your own words.",
      severity: "medium",
    });

  const overall_score = Math.round(
    perplexity_score * 0.25 +
      burstiness_score * 0.25 +
      detector_score * 0.35 +
      tone_drift_score * 0.15,
  );

  return {
    overall_score,
    classification:
      overall_score > 70 ? "likely_human" : overall_score > 45 ? "mixed" : "likely_ai",
    perplexity_score,
    burstiness_score,
    detector_score,
    tone_drift_score,
    ai_tells: tells,
    sentences: sentenceMetrics.slice(0, 60),
    suggestions,
  };
}

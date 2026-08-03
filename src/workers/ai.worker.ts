/// <reference lib="webworker" />
import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;
env.useBrowserCache = true;

/** Models currently in use. Anything else cached is purged on init. */
const DETECTOR_MODEL = "onnx-community/answerdotai-ModernBERT-base-ai-detector-ONNX";
const DETECTOR_FALLBACK = "onnx-community/chatgpt-detector-roberta-ONNX";
const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";

/** Models that used to ship with the app and must be evicted from user caches. */
const RETIRED_MODELS = [
  "Xenova/roberta-base-openai-detector",
  "onnx-community/roberta-base-openai-detector-ONNX",
  "Xenova/gpt2",
  "Xenova/distilgpt2",
];

let aiDetector: any = null;
let embedder: any = null;
let activeDetector = DETECTOR_MODEL;

const AI_TELLS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bIn conclusion[;,]?\s/gi, label: "In conclusion" },
  { pattern: /\bTo summarize[;,]?\s/gi, label: "To summarize" },
  {
    pattern: /\b(it is important to note that|it should be noted that)\b/gi,
    label: "hedging filler",
  },
  {
    pattern:
      /\b(delve into|leverage|utilize|paradigm|synergy|holistic|robust|tapestry|testament to|underscore|multifaceted|realm of)\b/gi,
    label: "LLM vocabulary",
  },
  {
    pattern: /\b(First and foremost|Secondly|Thirdly|Lastly|Finally)[;,]?\s/gi,
    label: "mechanical connective",
  },
  {
    pattern: /\b(not only .{0,40} but also|isn't just .{0,40} it's)\b/gi,
    label: "antithesis template",
  },
];

const post = (msg: unknown) => (self as unknown as Worker).postMessage(msg);

/** Delete cached weights for models the app no longer uses. */
async function purgeRetiredModels() {
  try {
    if (typeof caches === "undefined") return;
    const names = await caches.keys();
    for (const name of names) {
      if (!/transformers/i.test(name)) continue;
      const cache = await caches.open(name);
      const requests = await cache.keys();
      for (const request of requests) {
        if (RETIRED_MODELS.some((m) => request.url.includes(m))) {
          await cache.delete(request);
        }
      }
    }
  } catch {
    /* cache eviction is best-effort */
  }
}

async function loadPipeline(task: any, model: string, report: boolean) {
  const progress_callback = report
    ? (x: any) => post({ type: "progress", data: x })
    : undefined;
  const opts = { dtype: "q8", progress_callback } as any;
  try {
    return await pipeline(task, model, { ...opts, device: "webgpu" });
  } catch {
    return await pipeline(task, model, { ...opts, device: "wasm" });
  }
}

self.onmessage = async (event: MessageEvent) => {
  const { type, text } = event.data ?? {};

  if (type === "init") {
    try {
      await purgeRetiredModels();
      if (!aiDetector) {
        try {
          aiDetector = await loadPipeline("text-classification", DETECTOR_MODEL, true);
          activeDetector = DETECTOR_MODEL;
        } catch {
          aiDetector = await loadPipeline("text-classification", DETECTOR_FALLBACK, true);
          activeDetector = DETECTOR_FALLBACK;
        }
      }
      if (!embedder) {
        embedder = await loadPipeline("feature-extraction", EMBED_MODEL, true);
      }
      post({ type: "ready", data: { model: activeDetector } });
    } catch (err) {
      post({
        type: "error",
        message:
          "Couldn't load the local analysis models. Check your connection and try again, or use a recent desktop Chrome/Edge. (" +
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

function stdev(values: number[]) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
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

/** Probability that a passage is machine-written, 0..1 */
async function detectAiProbability(passage: string) {
  const chunks = chunkText(passage, 340, 60);
  const results: { p: number; w: number }[] = [];
  for (const chunk of chunks) {
    const output: any = await aiDetector(chunk, { top_k: 2 });
    const arr = Array.isArray(output) ? output.flat() : [output];
    const ai = arr.find((x: any) => /fake|^ai\b|ai[-_ ]?generated|chatgpt|machine|label_?1/i.test(x.label));
    const human = arr.find((x: any) => /human|real|label_?0/i.test(x.label));
    let p: number;
    if (ai) p = ai.score;
    else if (human) p = 1 - human.score;
    else p = 0.5;
    results.push({ p, w: Math.max(0.05, Math.abs(p - 0.5) * 2) });
  }
  const totalW = results.reduce((s, r) => s + r.w, 0) || 1;
  return results.reduce((s, r) => s + r.p * r.w, 0) / totalW;
}

type ParagraphScore = {
  index: number;
  text: string;
  start: number;
  end: number;
  words: number;
  ai_probability: number;
  human_score: number;
  is_prose: boolean;
};

async function analyzeDocument(text: string) {
  const sentences = sentenceSplit(text);

  /* --- paragraph segmentation: each paragraph judged in isolation --- */
  const rawParagraphs: { text: string; start: number }[] = [];
  {
    let cursor = 0;
    for (const raw of text.split(/\n\s*\n/)) {
      const idx = text.indexOf(raw, cursor);
      const start = idx >= 0 ? idx : cursor;
      cursor = start + raw.length;
      if (raw.trim().length > 0) rawParagraphs.push({ text: raw, start });
    }
  }
  if (!rawParagraphs.length) rawParagraphs.push({ text, start: 0 });

  const paragraphs: ParagraphScore[] = [];
  for (let i = 0; i < rawParagraphs.length; i++) {
    const { text: pText, start } = rawParagraphs[i];
    const words = tokenize(pText).length;
    const p = await detectAiProbability(pText);
    paragraphs.push({
      index: i,
      text: pText.trim(),
      start,
      end: start + pText.length,
      words,
      ai_probability: Math.round(p * 100) / 100,
      human_score: Math.round((1 - p) * 100),
      is_prose: words >= 25,
    });
    post({ type: "analysis_progress", data: (i + 1) / rawParagraphs.length });
  }

  /* --- length-weighted detector score, with a floor cap --- */
  const totalWords = paragraphs.reduce((s, p) => s + p.words, 0) || 1;
  let detector_score = Math.round(
    paragraphs.reduce((s, p) => s + p.human_score * p.words, 0) / totalWords,
  );
  const prose = paragraphs.filter((p) => p.is_prose);
  const worstProse = prose.length ? Math.min(...prose.map((p) => p.human_score)) : null;
  const capped = worstProse !== null && worstProse < 30;
  if (capped) detector_score = Math.min(detector_score, 42);

  const avgAiProb = 1 - detector_score / 100;

  /* --- author consistency: spread between paragraph scores --- */
  const scored = prose.length >= 2 ? prose : paragraphs;
  const sd = stdev(scored.map((p) => p.human_score));
  const author_consistency_score =
    scored.length < 2 ? 100 : Math.round(clamp(100 - sd * 2.4));
  const mixed_authorship = scored.length >= 2 && author_consistency_score < 60;

  /* --- sentence level --- */
  const paragraphFor = (pos: number) =>
    paragraphs.find((p) => pos >= p.start && pos <= p.end) ?? paragraphs[0];

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
    const para = paragraphFor(Math.max(0, start));
    const base = para ? para.ai_probability : avgAiProb;
    const localProb = clamp(base * 100 + (flags.includes("ai_tell") ? 12 : 0)) / 100;
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
  const proseParagraphs = rawParagraphs
    .map((p) => p.text)
    .filter((p) => p.trim().length > 40);
  let toneDrift = 65;
  if (proseParagraphs.length >= 2 && embedder) {
    const embs: Float32Array[] = [];
    for (const p of proseParagraphs.slice(0, 8)) {
      const out: any = await embedder(p, { pooling: "mean", normalize: true });
      embs.push(out.data);
    }
    const sims: number[] = [];
    for (let i = 1; i < embs.length; i++) sims.push(cosineSimilarity(embs[i - 1], embs[i]));
    const mean = sims.reduce((a, b) => a + b, 0) / (sims.length || 1);
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
  const tone_drift_score = Math.round(toneDrift);

  const suggestions: { type: string; message: string; severity: string }[] = [];
  if (capped && worstProse !== null)
    suggestions.push({
      type: "ai_paragraph",
      message: `At least one paragraph scores ${worstProse}/100 human on its own. A single machine-written passage is enough to fail review — rewrite that paragraph before anything else.`,
      severity: "high",
    });
  if (mixed_authorship)
    suggestions.push({
      type: "author_consistency",
      message:
        "Mixed Authorship Detected: paragraph scores swing widely across the document, which usually means some sections were written by a model and others by hand. Even out the voice or rewrite the outliers.",
      severity: "high",
    });
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

  let overall_score = Math.round(
    perplexity_score * 0.2 +
      burstiness_score * 0.2 +
      detector_score * 0.4 +
      tone_drift_score * 0.1 +
      author_consistency_score * 0.1,
  );

  // Hard cap: one clearly machine-written prose paragraph can't be averaged away.
  if (capped) overall_score = Math.min(overall_score, worstProse! < 15 ? 40 : 60);
  if (mixed_authorship) overall_score = Math.min(overall_score, 65);

  return {
    overall_score,
    classification:
      overall_score > 70 ? "likely_human" : overall_score > 45 ? "mixed" : "likely_ai",
    perplexity_score,
    burstiness_score,
    detector_score,
    tone_drift_score,
    author_consistency_score,
    mixed_authorship,
    detector_model: activeDetector,
    paragraphs,
    ai_tells: tells,
    sentences: sentenceMetrics.slice(0, 60),
    suggestions,
  };
}

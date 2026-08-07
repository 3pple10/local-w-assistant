/// <reference lib="webworker" />
/**
 * AI Text Diagnostic Engine — Swarm Architecture.
 *
 * L0 Input Sanitizer      [0MB, deterministic]
 * L1 Surface Scanner      [0MB, regex]
 * L2 Structural Profiler  [~0MB, in-document Isolation-Forest style anomaly scoring]
 * L3 Syntactic Fingerprint[~0MB, stylometric logistic regression fallback]
 * L4 Semantic Master      [~23MB, Xenova/all-MiniLM-L6-v2 — lazy, only when needed]
 * L5 N-gram Entropy       [0MB, in-document Markov model]
 * L6 Burstiness           [0MB, pure math]
 * L7 Ensemble Fusion      [0MB, deterministic arbitration]
 * L8 Human Signal         [0MB, positive human-evidence scanner]
 *
 * No single transformer classifier. The master is loaded lazily and cached by
 * transformers.js in browser storage; every layer degrades to deterministic
 * rules rather than crashing.
 */

import { humanReport, sentenceHumanScore } from "@/lib/human-signals";



/** Models the app no longer uses — evicted from user caches on init. */
const RETIRED_MODELS = [
  "Xenova/roberta-base-openai-detector",
  "onnx-community/roberta-base-openai-detector-ONNX",
  "onnx-community/answerdotai-ModernBERT-base-ai-detector-ONNX",
  "onnx-community/chatgpt-detector-roberta-ONNX",
  "Xenova/gpt2",
  "Xenova/distilgpt2",
];

const MASTER_MODEL = "Xenova/all-MiniLM-L6-v2";

let embedder: any = null;
let masterFailed = false;

const post = (msg: unknown) => (self as unknown as Worker).postMessage(msg);

/* ------------------------------------------------------------------ */
/* L0 — Input Sanitizer                                                */
/* ------------------------------------------------------------------ */

const ZERO_WIDTH = /[\u200b\u200c\u200d\ufeff\u2060]/g;
const HOMOGLYPHS: Record<string, string> = {
  а: "a", о: "o", е: "e", р: "p", с: "c", х: "x",
  А: "A", О: "O", Е: "E", Р: "P", С: "C", Х: "X",
};

export type SectionKind = "prose" | "reference" | "equation" | "table" | "header";

type Section = { text: string; start: number; kind: SectionKind };

function sanitize(raw: string) {
  let zeroWidth = 0;
  let homoglyphs = 0;
  const cleaned = raw
    .replace(ZERO_WIDTH, () => {
      zeroWidth++;
      return "";
    })
    .replace(/[аоерсхАОЕРСХ]/g, (c) => {
      homoglyphs++;
      return HOMOGLYPHS[c] ?? c;
    });
  return { cleaned, zeroWidth, homoglyphs };
}

function classifySection(text: string): SectionKind {
  const t = text.trim();
  const words = t.split(/\s+/).filter(Boolean);
  if (/^\s*(references|bibliography|works cited)\b/i.test(t)) return "header";
  if (/^\s*\[\d+\]|^\s*\d+\.\s+[A-Z][^.]+,\s*[A-Z]\./.test(t)) return "reference";
  if (/https?:\/\//.test(t) && words.length < 25) return "reference";
  if (/(\\\[|\\\(|\$\$|\\frac|\\sum|=\s*[-\d(])/.test(t) && words.length < 40) return "equation";
  if (/\|.*\|/.test(t) || /\t.*\t/.test(t)) return "table";
  if (words.length <= 8 && !/[.!?]$/.test(t)) return "header";
  return "prose";
}

function segment(text: string): Section[] {
  const sections: Section[] = [];
  let cursor = 0;
  for (const raw of text.split(/\n\s*\n/)) {
    const idx = text.indexOf(raw, cursor);
    const start = idx >= 0 ? idx : cursor;
    cursor = start + raw.length;
    if (raw.trim().length) sections.push({ text: raw, start, kind: classifySection(raw) });
  }
  if (!sections.length) sections.push({ text, start: 0, kind: classifySection(text) });
  return sections;
}

/* ------------------------------------------------------------------ */
/* L1 — Surface Scanner                                                */
/* ------------------------------------------------------------------ */

const SURFACE_RULES: { category: string; label: string; pattern: RegExp }[] = [
  {
    category: "generic_transition",
    label: "generic transition",
    pattern: /\b(in conclusion|furthermore|moreover|additionally|in summary|to summarize)\b/gi,
  },
  {
    category: "hedging",
    label: "hedging overload",
    pattern: /\b(it is important to note|it should be noted|it is worth noting|it is widely believed)\b/gi,
  },
  {
    category: "buzzword",
    label: "buzzword stuffing",
    pattern:
      /\b(delve into|leverage|utilize|paradigm|holistic|robust|synergy|tapestry|testament to|underscore|multifaceted|realm of)\b/gi,
  },
  {
    category: "listicle",
    label: "listicle structure",
    pattern: /\b(firstly|secondly|thirdly|lastly|first and foremost)\b/gi,
  },
  {
    category: "passive",
    label: "passive overuse",
    pattern: /\b(is considered to be|is defined as|can be seen as|has been shown to be|are known to be)\b/gi,
  },
  {
    category: "filler_opener",
    label: "AI filler opener",
    pattern: /\b(in today's world|in the modern era|with the advent of|since the dawn of)\b/gi,
  },
];

function surfaceScan(text: string) {
  const hits: { category: string; label: string; count: number }[] = [];
  let total = 0;
  for (const rule of SURFACE_RULES) {
    rule.pattern.lastIndex = 0;
    const m = text.match(rule.pattern);
    if (m?.length) {
      hits.push({ category: rule.category, label: rule.label, count: m.length });
      total += m.length;
    }
  }
  return { hits, total };
}

/* ------------------------------------------------------------------ */
/* shared helpers                                                      */
/* ------------------------------------------------------------------ */

function tokenize(text: string) {
  return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

function sentenceSplit(text: string) {
  return (text.match(/[^.!?]+[.!?]+/g) ?? [text]).filter((s) => s.trim().length > 0);
}

function mean(v: number[]) {
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

function stdev(v: number[]) {
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length);
}

function cv(v: number[]) {
  const m = mean(v);
  return m ? stdev(v) / m : 0;
}

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

function cosine(a: ArrayLike<number>, b: ArrayLike<number>) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/* ------------------------------------------------------------------ */
/* L2 — Structural Profiler (isolation-style anomaly on own document)  */
/* ------------------------------------------------------------------ */

function structuralFeatures(sent: string) {
  const words = tokenize(sent).length || 1;
  const chars = sent.length || 1;
  return [
    words,
    (sent.match(/,/g)?.length ?? 0) / words,
    sent.match(/;/g)?.length ?? 0,
    sent.match(/[()]/g)?.length ?? 0,
    (sent.match(/\d/g)?.length ?? 0) / chars,
    (sent.match(/[A-Z]/g)?.length ?? 0) / chars,
    sent.match(/!/g)?.length ?? 0,
  ];
}

/**
 * Isolation-Forest style scoring without a model file: build random axis-aligned
 * splits over the document's own feature distribution and measure isolation depth.
 * Deterministic seeded RNG so repeat runs on the same draft agree.
 */
function structuralProfile(sentences: string[]) {
  if (sentences.length < 3) return { scores: sentences.map(() => 0), flagged: 0, ratio: 0 };
  const feats = sentences.map(structuralFeatures);
  const dims = feats[0].length;

  let seed = 1337;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  const depths = feats.map(() => 0);
  const TREES = 64;
  const limit = Math.ceil(Math.log2(feats.length));
  for (let t = 0; t < TREES; t++) {
    for (let i = 0; i < feats.length; i++) {
      let lo = feats.map((f) => f);
      let depth = 0;
      while (lo.length > 1 && depth < limit) {
        const d = Math.floor(rnd() * dims);
        const values = lo.map((f) => f[d]);
        const min = Math.min(...values);
        const max = Math.max(...values);
        if (min === max) break;
        const split = min + rnd() * (max - min);
        const goLeft = feats[i][d] < split;
        lo = lo.filter((f) => (f[d] < split) === goLeft);
        depth++;
      }
      depths[i] += depth;
    }
  }
  const avg = depths.map((d) => d / TREES);
  const c = 2 * (Math.log(feats.length - 1) + 0.5772156649) - (2 * (feats.length - 1)) / feats.length;
  const scores = avg.map((d) => 2 ** (-d / (c || 1)));
  const flaggedIdx = scores.map((s) => s > 0.6);
  const flagged = flaggedIdx.filter(Boolean).length;
  return { scores, flagged, ratio: flagged / sentences.length };
}

/* ------------------------------------------------------------------ */
/* L3 — Syntactic Fingerprint (stylometric logistic regression)        */
/* ------------------------------------------------------------------ */

const FUNCTION_WORDS = new Set([
  "the", "of", "that", "which", "and", "to", "in", "for", "with", "as", "is", "are", "be",
]);

function stylometrics(text: string) {
  const tokens = tokenize(text);
  if (tokens.length < 5) return { probability: 0.5, features: null as any };
  const avgWordLen = mean(tokens.map((t) => t.length));
  const fnRatio = tokens.filter((t) => FUNCTION_WORDS.has(t)).length / tokens.length;
  const counts = new Map<string, number>();
  tokens.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1));
  const ttr = counts.size / tokens.length;
  const hapax = [...counts.values()].filter((c) => c === 1).length / counts.size;

  // Logistic regression over stylometric features (AI-leaning positive weights).
  const z =
    -1.9 +
    (avgWordLen - 4.4) * 1.15 +
    (fnRatio - 0.34) * 4.2 +
    (0.55 - ttr) * 3.6 +
    (0.62 - hapax) * 3.1;
  const probability = 1 / (1 + Math.exp(-z));
  return {
    probability,
    features: {
      avg_word_length: Math.round(avgWordLen * 100) / 100,
      function_word_ratio: Math.round(fnRatio * 1000) / 1000,
      type_token_ratio: Math.round(ttr * 1000) / 1000,
      hapax_ratio: Math.round(hapax * 1000) / 1000,
    },
  };
}

/* ------------------------------------------------------------------ */
/* L5 — N-gram entropy engine (document-internal Markov model)         */
/* ------------------------------------------------------------------ */

function buildMarkov(tokens: string[], n: number) {
  const table = new Map<string, Map<string, number>>();
  for (let i = n - 1; i < tokens.length; i++) {
    const ctx = tokens.slice(i - n + 1, i).join(" ");
    const next = tokens[i];
    let row = table.get(ctx);
    if (!row) table.set(ctx, (row = new Map()));
    row.set(next, (row.get(next) ?? 0) + 1);
  }
  return table;
}

function crossEntropy(tokens: string[], table: Map<string, Map<string, number>>, n: number) {
  let sum = 0;
  let count = 0;
  for (let i = n - 1; i < tokens.length; i++) {
    const ctx = tokens.slice(i - n + 1, i).join(" ");
    const row = table.get(ctx);
    const total = row ? [...row.values()].reduce((a, b) => a + b, 0) : 0;
    const c = row?.get(tokens[i]) ?? 0;
    const p = (c + 0.4) / (total + 0.4 * 50);
    sum += -Math.log2(p);
    count++;
  }
  return count ? sum / count : 6;
}

function entropyEngine(text: string, sentences: string[]) {
  const docTokens = tokenize(text);
  const t3 = buildMarkov(docTokens, 3);
  const t5 = buildMarkov(docTokens, 5);
  const perSentence = sentences.map((s) => {
    const tk = tokenize(s);
    if (tk.length < 4) return 6;
    return (crossEntropy(tk, t3, 3) + crossEntropy(tk, t5, 5)) / 2;
  });
  const m = mean(perSentence);
  const sd = stdev(perSentence);
  const threshold = m - 0.5 * sd;
  const flagged = perSentence.map((p) => p < threshold);
  // Document-level perplexity score, 0-100 (higher = more human/unpredictable).
  const score = clamp((m - 2.5) * 22);
  return { perSentence, flagged, threshold, score: Math.round(score) };
}

/* ------------------------------------------------------------------ */
/* L6 — Burstiness                                                     */
/* ------------------------------------------------------------------ */

function formality(text: string) {
  const tokens = tokenize(text);
  if (!tokens.length) return 0;
  const long = tokens.filter((t) => t.length > 7).length / tokens.length;
  const contractions = (text.match(/'\w/g)?.length ?? 0) / tokens.length;
  return long - contractions;
}

function burstiness(sentences: string[], paragraphTexts: string[]) {
  if (sentences.length < 2) return { index: 0.2, score: 40, parts: {} as Record<string, number> };
  const lengths = sentences.map((s) => tokenize(s).length || 1);
  const punct = sentences.map((s) => (s.match(/[,;:—-]/g)?.length ?? 0) + 1);
  const clauses = sentences.map(
    (s) => (s.match(/[,]|\b(and|but|or|because|although|while|whereas|which|that)\b/gi)?.length ?? 0) + 1,
  );
  const form = paragraphTexts.length > 1 ? paragraphTexts.map(formality) : [0, 0];

  const parts = {
    sentence_length_cv: cv(lengths),
    punctuation_cv: cv(punct),
    clause_cv: cv(clauses),
    formality_cv: Math.abs(cv(form.map((f) => f + 1))),
  };
  const index =
    parts.sentence_length_cv * 0.5 +
    parts.punctuation_cv * 0.2 +
    parts.clause_cv * 0.2 +
    parts.formality_cv * 0.1;
  // Human CV target 0.4–1.0; AI typical 0.15–0.35.
  const score = clamp(((index - 0.15) / (0.85 - 0.15)) * 100);
  return { index, score: Math.round(score), parts };
}

/* ------------------------------------------------------------------ */
/* L4 — Semantic Master (lazy)                                         */
/* ------------------------------------------------------------------ */

async function purgeRetiredModels() {
  try {
    if (typeof caches === "undefined") return;
    for (const name of await caches.keys()) {
      if (!/transformers/i.test(name)) continue;
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        if (RETIRED_MODELS.some((m) => request.url.includes(m))) await cache.delete(request);
      }
    }
  } catch {
    /* eviction is best-effort */
  }
}

async function loadMaster() {
  if (embedder || masterFailed) return embedder;
  post({ type: "layer", data: { layer: "L4", name: "Semantic Master (MiniLM)", size: "23MB", state: "loading" } });
  try {
    const { pipeline, env } = await import("@huggingface/transformers");
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    await purgeRetiredModels();
    const opts = {
      dtype: "q8",
      progress_callback: (x: any) => post({ type: "progress", data: x }),
    } as any;
    try {
      embedder = await pipeline("feature-extraction", MASTER_MODEL, { ...opts, device: "webgpu" });
    } catch {
      embedder = await pipeline("feature-extraction", MASTER_MODEL, { ...opts, device: "wasm" });
    }
    post({ type: "layer", data: { layer: "L4", name: "Semantic Master (MiniLM)", size: "23MB", state: "ready" } });
  } catch {
    masterFailed = true;
    post({ type: "layer", data: { layer: "L4", name: "Semantic Master (MiniLM)", size: "23MB", state: "failed" } });
  }
  return embedder;
}

async function embed(text: string): Promise<Float32Array | null> {
  if (!embedder) return null;
  try {
    const out: any = await embedder(text, { pooling: "mean", normalize: true });
    return out.data as Float32Array;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* worker entry                                                        */
/* ------------------------------------------------------------------ */

self.onmessage = async (event: MessageEvent) => {
  const { type, text } = event.data ?? {};
  if (type === "init") {
    await purgeRetiredModels();
    post({ type: "ready", data: { engine: "swarm-v1" } });
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

type LayerEvent = {
  layer: string;
  name: string;
  size: string;
  fired: boolean;
  detail: string;
};

async function analyzeDocument(input: string) {
  const swarm: LayerEvent[] = [];
  const overrides: string[] = [];
  const step = (n: number) => post({ type: "analysis_progress", data: n });

  /* ---- L0 ---- */
  const { cleaned, zeroWidth, homoglyphs } = sanitize(input);
  const sections = segment(cleaned);
  const prose = sections.filter((s) => s.kind === "prose");
  const analysed = prose.length ? prose : sections;
  swarm.push({
    layer: "L0",
    name: "Input Sanitizer",
    size: "0MB",
    fired: zeroWidth > 0 || homoglyphs > 0,
    detail: `${sections.length} sections (${prose.length} prose, ${sections.length - prose.length} skipped as reference/equation/table/header)${
      zeroWidth || homoglyphs ? ` · stripped ${zeroWidth} zero-width, normalized ${homoglyphs} homoglyphs` : ""
    }`,
  });
  step(0.1);

  const text = cleaned;
  const sentences = sentenceSplit(analysed.map((s) => s.text).join("\n\n"));

  /* ---- L1 ---- */
  const perParagraphSurface = analysed.map((s) => surfaceScan(s.text));
  const docSurface = surfaceScan(analysed.map((s) => s.text).join("\n\n"));
  const surfaceHeavy = perParagraphSurface.map((s) => s.total > 5);
  swarm.push({
    layer: "L1",
    name: "Surface Scanner",
    size: "0MB",
    fired: docSurface.total > 0,
    detail: docSurface.total
      ? `${docSurface.total} hits — ${docSurface.hits.map((h) => `${h.label} (${h.count})`).join(", ")}${
          surfaceHeavy.some(Boolean) ? ` · ${surfaceHeavy.filter(Boolean).length} paragraph(s) over threshold` : ""
        }`
      : "No template phrasing found",
  });
  step(0.2);

  /* ---- L2 ---- */
  const l2 = structuralProfile(sentences);
  swarm.push({
    layer: "L2",
    name: "Structural Profiler",
    size: "~450KB → in-document fallback",
    fired: l2.ratio > 0.3,
    detail: `${l2.flagged}/${sentences.length} sentences anomalous (${Math.round(l2.ratio * 100)}%)${
      l2.ratio > 0.3 ? " — escalated to L3" : ""
    }`,
  });
  step(0.32);

  /* ---- L3 ---- */
  const l3Doc = stylometrics(text);
  const l3PerParagraph = analysed.map((s) => stylometrics(s.text).probability);
  swarm.push({
    layer: "L3",
    name: "Syntactic Fingerprint",
    size: "~50KB stylometric LR",
    fired: l3Doc.probability > 0.7,
    detail: l3Doc.features
      ? `AI-template probability ${(l3Doc.probability * 100).toFixed(0)}% · word len ${l3Doc.features.avg_word_length}, function-word ${l3Doc.features.function_word_ratio}, TTR ${l3Doc.features.type_token_ratio}, hapax ${l3Doc.features.hapax_ratio}`
      : "Too short for a stylometric read",
  });
  step(0.45);

  /* ---- L5 ---- */
  const l5 = entropyEngine(text, sentences);
  swarm.push({
    layer: "L5",
    name: "N-gram Entropy Engine",
    size: "0MB (in-document Markov)",
    fired: l5.flagged.some(Boolean),
    detail: `${l5.flagged.filter(Boolean).length} sentences below the document's own perplexity floor`,
  });
  step(0.55);

  /* ---- L6 ---- */
  const l6 = burstiness(sentences, analysed.map((s) => s.text));
  swarm.push({
    layer: "L6",
    name: "Burstiness Calculator",
    size: "0MB",
    fired: l6.index < 0.4,
    detail: `Composite CV ${l6.index.toFixed(2)} (human 0.40–1.00, AI 0.15–0.35)`,
  });
  step(0.62);

  /* ---- swarm paragraph scores (pre-master) ---- */
  const swarmParagraphProb = analysed.map((s, i) => {
    const surf = Math.min(1, perParagraphSurface[i].total / 6);
    const styl = l3PerParagraph[i];
    const paraSentences = sentenceSplit(s.text);
    const anomaly = structuralProfile(paraSentences).ratio;
    const burst = 1 - burstiness(paraSentences, [s.text]).score / 100;
    const ent = 1 - entropyEngine(s.text, paraSentences).score / 100;
    // No single layer above 25% weight.
    return clamp((surf * 0.22 + styl * 0.25 + anomaly * 0.15 + burst * 0.2 + ent * 0.18) * 100) / 100;
  });

  const swarmDocScore = Math.round(
    100 -
      (mean(swarmParagraphProb.map((p, i) => p * (tokenize(analysed[i].text).length || 1))) /
        (mean(analysed.map((s) => tokenize(s.text).length || 1)) || 1)) *
        100,
  );

  /* ---- L4 master: only when the swarm is uncertain or disagrees ---- */
  const uncertain = swarmDocScore >= 40 && swarmDocScore <= 60;
  const disagreement =
    (l3Doc.probability > 0.7 && l6.index > 0.4) || (l3Doc.probability < 0.35 && l2.ratio > 0.3);
  const needMaster = uncertain || disagreement || analysed.length > 1;

  let toneDrift = 65;
  let masterNote = "Not needed — swarm layers agreed";
  let masterFired = false;
  let alienSentences = 0;
  let uniformPairs = 0;
  let fragmentation = false;

  if (needMaster) {
    await loadMaster();
    if (embedder) {
      masterFired = true;
      const embs: (Float32Array | null)[] = [];
      for (const s of analysed.slice(0, 12)) embs.push(await embed(s.text));
      const valid = embs.filter(Boolean) as Float32Array[];
      const sims: number[] = [];
      for (let i = 1; i < valid.length; i++) sims.push(cosine(valid[i - 1], valid[i]));
      uniformPairs = sims.filter((s) => s > 0.92).length;
      const disjoint = sims.filter((s) => s < 0.55).length;
      fragmentation = disjoint > 0;

      // Document centroid distances.
      let centroidSpread = 0;
      if (valid.length) {
        const dim = valid[0].length;
        const centroid = new Float32Array(dim);
        for (const v of valid) for (let i = 0; i < dim; i++) centroid[i] += v[i] / valid.length;
        const dists = valid.map((v) => 1 - cosine(v, centroid));
        centroidSpread = stdev(dists);
      }

      // Alien insertions: swarm-flagged sentences that don't belong to their paragraph.
      for (let i = 0; i < analysed.length && i < 8; i++) {
        if (swarmParagraphProb[i] < 0.5) continue;
        const paraEmb = embs[i];
        if (!paraEmb) continue;
        for (const sent of sentenceSplit(analysed[i].text).slice(0, 6)) {
          const se = await embed(sent);
          if (se && cosine(se, paraEmb) < 0.65) alienSentences++;
        }
      }

      const avgSim = mean(sims);
      toneDrift = clamp(100 - Math.abs(avgSim - 0.72) * 210 + centroidSpread * 60);
      masterNote = `Paragraph similarity avg ${avgSim.toFixed(2)} · ${uniformPairs} pair(s) >0.92 (too uniform) · ${disjoint} pair(s) <0.55 (disjointed) · ${alienSentences} alien sentence insertion(s) · centroid spread ${centroidSpread.toFixed(3)}`;
    } else {
      masterNote = "Failed to load — falling back to deterministic tone heuristics";
      toneDrift = clamp(50 + l6.index * 40);
    }
  } else {
    toneDrift = clamp(50 + l6.index * 40);
  }
  swarm.push({
    layer: "L4",
    name: "Semantic Master (MiniLM)",
    size: "~23MB",
    fired: masterFired,
    detail: masterNote,
  });
  step(0.88);

  /* ---- paragraph scores ---- */
  const paragraphs = analysed.map((s, i) => {
    const words = tokenize(s.text).length;
    let p = swarmParagraphProb[i];
    if (perParagraphSurface[i].total > 5) p = Math.max(p, 0.72);
    return {
      index: i,
      text: s.text.trim(),
      start: s.start,
      end: s.start + s.text.length,
      words,
      ai_probability: Math.round(p * 100) / 100,
      human_score: Math.round((1 - p) * 100),
      is_prose: words >= 25,
      kind: s.kind,
      surface_hits: perParagraphSurface[i].total,
    };
  });

  const totalWords = paragraphs.reduce((s, p) => s + p.words, 0) || 1;
  let detector_score = Math.round(
    paragraphs.reduce((s, p) => s + p.human_score * p.words, 0) / totalWords,
  );

  const proseParas = paragraphs.filter((p) => p.is_prose);
  const worstProse = proseParas.length ? Math.min(...proseParas.map((p) => p.human_score)) : null;
  const capped = worstProse !== null && worstProse < 30;
  if (capped) detector_score = Math.min(detector_score, 42);

  /* ---- author consistency ---- */
  const scored = proseParas.length >= 2 ? proseParas : paragraphs;
  const sd = stdev(scored.map((p) => p.human_score));
  const author_consistency_score = scored.length < 2 ? 100 : Math.round(clamp(100 - sd * 2.4));
  const mixed_authorship = scored.length >= 2 && sd > 25;

  /* ---- L8 human signal (positive evidence, independent of the AI layers) ---- */
  const l8 = humanReport(text);
  const l8Paragraphs = analysed.map((s) => humanReport(s.text));
  const humanRich = l8Paragraphs.filter((r) => r.human_signal >= 60).length;
  const humanBare = l8Paragraphs.filter((r) => r.human_signal < 30).length;
  swarm.push({
    layer: "L8",
    name: "Human Signal Scanner",
    size: "0MB",
    fired: true,
    detail:
      `Human evidence ${l8.human_signal}/100 vs machine pressure ${l8.ai_pressure}/100 · ` +
      (l8.markers.length
        ? `markers: ${l8.markers.slice(0, 4).map((m) => `${m.label} (${m.count})`).join(", ")}`
        : "no positive human markers found") +
      ` · ${humanRich} rich / ${humanBare} bare paragraph(s)`,
  });

  /* ---- sentence level ---- */
  let cursor = 0;
  const paragraphFor = (pos: number) =>
    paragraphs.find((p) => pos >= p.start && pos <= p.end) ?? paragraphs[0];
  const sentenceMetrics = sentences.slice(0, 200).map((sent, i) => {
    const start = text.indexOf(sent, cursor);
    cursor = start >= 0 ? start + sent.length : cursor;
    const flags: string[] = [];
    if (surfaceScan(sent).total > 0) flags.push("ai_tell");
    if (l5.flagged[i]) flags.push("low_perplexity");
    if (l2.scores[i] > 0.6) flags.push("structural_anomaly");
    if (tokenize(sent).length > 34) flags.push("long_sentence");
    const para = paragraphFor(Math.max(0, start));
    const base = para ? para.ai_probability : 1 - detector_score / 100;
    const localProb = clamp(base * 100 + (flags.includes("ai_tell") ? 12 : 0)) / 100;
    const human = sentenceHumanScore(sent);
    return {
      text: sent.trim(),
      start: Math.max(0, start),
      end: Math.max(0, start) + sent.length,
      ai_probability: Math.round(localProb * 100) / 100,
      perplexity: Math.round((l5.perSentence[i] ?? 6) * 10) / 10,
      flags,
      human_score: human.score,
      human_markers: human.categories,
    };
  });


  /* ---- L7 fusion ---- */
  const perplexity_score = l5.score;
  const burstiness_score = l6.score;
  const tone_drift_score = Math.round(toneDrift);
  const human_signal_score = l8.human_signal;
  const ai_pressure_score = l8.ai_pressure;

  let overall_score = Math.round(
    perplexity_score * 0.17 +
      burstiness_score * 0.17 +
      detector_score * 0.22 +
      tone_drift_score * 0.12 +
      author_consistency_score * 0.17 +
      human_signal_score * 0.15,
  );


  let classification =
    overall_score > 70 ? "likely_human" : overall_score > 45 ? "mixed" : "likely_ai";
  const downgrade = (reason: string, cap: number) => {
    if (overall_score > cap) {
      overall_score = cap;
      classification = overall_score > 45 ? "mixed" : "likely_ai";
    }
    overrides.push(reason);
  };

  if (surfaceHeavy.some(Boolean))
    overrides.push(`L1 override: ${surfaceHeavy.filter(Boolean).length} paragraph(s) exceeded 5 surface hits and were flagged.`);
  if (l3Doc.probability > 0.7)
    downgrade("L3 override: syntactic fingerprint above 0.70 — classification floored at Mixed.", 65);
  if (uniformPairs > 3)
    downgrade("L4 master override: >3 paragraph pairs above 0.92 similarity — unnatural uniformity.", 65);
  if (alienSentences > 0)
    overrides.push(`L4 master: ${alienSentences} sentence(s) semantically alien to their paragraph.`);
  if (capped && worstProse !== null)
    downgrade(
      `L7 hard cap: a prose paragraph scores ${worstProse}/100 human — overall capped.`,
      worstProse < 15 ? 40 : 60,
    );
  if (mixed_authorship)
    downgrade(`L7: paragraph score spread ${sd.toFixed(0)} points — Mixed Authorship Detected.`, 65);
  if (classification === "likely_human" && fragmentation) {
    classification = "review_needed";
    overrides.push("L4 master: swarm reads human but semantic fragmentation detected — Review Needed.");
  }
  if (uncertain && masterFired) {
    overrides.push("Swarm uncertain (40–60) — master arbitration decided the final classification.");
  }
  if (human_signal_score < 25 && classification === "likely_human") {
    classification = "review_needed";
    overrides.push(
      `L8 override: almost no positive human evidence (${human_signal_score}/100) despite passing AI checks — Review Needed.`,
    );
  }
  if (human_signal_score >= 70 && classification === "mixed" && !capped && !mixed_authorship) {
    overrides.push(
      `L8: strong human evidence (${human_signal_score}/100) counterweights the Mixed reading — treat flags as guidance.`,
    );
  }
  if (!overrides.length) overrides.push("No overrides fired — weighted swarm vote stands.");


  swarm.push({
    layer: "L7",
    name: "Ensemble Fusion",
    size: "0MB",
    fired: true,
    detail: `Weighted vote → ${overall_score}/100 · ${classification.replace("_", " ")}`,
  });
  step(1);

  /* ---- suggestions ---- */
  const suggestions: { type: string; message: string; severity: string }[] = [];
  if (capped && worstProse !== null)
    suggestions.push({
      type: "ai_paragraph",
      message: `At least one paragraph scores ${worstProse}/100 human on its own. A single machine-written passage is enough to fail review — rewrite that paragraph first.`,
      severity: "high",
    });
  if (mixed_authorship)
    suggestions.push({
      type: "author_consistency",
      message:
        "Mixed Authorship Detected: paragraph scores swing more than 25 points across the document. Even out the voice or rewrite the outliers.",
      severity: "high",
    });
  if (burstiness_score < 50)
    suggestions.push({
      type: "burstiness",
      message:
        "Sentence rhythm is too uniform. Break one long sentence in two, and let another run long — human writing swings.",
      severity: burstiness_score < 35 ? "high" : "medium",
    });
  if (perplexity_score < 55)
    suggestions.push({
      type: "perplexity",
      message:
        "Word choice is highly predictable against your own document's distribution. Add specific verbs and concrete nouns from your experience.",
      severity: "medium",
    });
  if (l2.ratio > 0.3)
    suggestions.push({
      type: "structure",
      message: `${Math.round(l2.ratio * 100)}% of sentences share a near-identical structural profile. Vary clause construction and punctuation.`,
      severity: "medium",
    });
  if (tone_drift_score < 55)
    suggestions.push({
      type: "tone_drift",
      message:
        "Paragraph-to-paragraph voice is unnaturally flat. Vary register: a shorter, blunter paragraph in the middle helps.",
      severity: "low",
    });
  if (docSurface.total)
    suggestions.push({
      type: "ai_tells",
      message:
        "Found telltale phrasing: " +
        docSurface.hits.map((h) => `${h.label} (${h.count})`).join(", ") +
        ". Rewrite these in your own words.",
      severity: "medium",
    });
  if (human_signal_score < 45)
    suggestions.push({
      type: "human_signal",
      message:
        "Little positive human evidence: no contractions, asides, first-person judgement or concrete specifics. Passing the AI checks is not the same as sounding like you — add something only you would write.",
      severity: human_signal_score < 25 ? "high" : "medium",
    });

  return {
    overall_score,
    classification,
    perplexity_score,
    burstiness_score,
    detector_score,
    tone_drift_score,
    author_consistency_score,
    human_signal_score,
    ai_pressure_score,
    human_markers: l8.markers.map((m) => ({ label: m.label, count: m.count })),
    mixed_authorship,
    detector_model: "swarm (L0–L8)" + (masterFired ? " + MiniLM master" : ""),
    paragraphs,
    ai_tells: docSurface.hits.map((h) => ({ phrase: h.label, count: h.count })),
    sentences: sentenceMetrics.slice(0, 60),
    suggestions,
    swarm,
    overrides,
    skipped_sections: sections.filter((s) => s.kind !== "prose").length,
  };

}

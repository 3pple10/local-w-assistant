/**
 * L8 — Human Signal layer.
 *
 * Positive evidence that a *person* wrote a passage, scored independently of the
 * AI-detection layers. Deterministic and dependency-free so it can run inside the
 * analysis worker and synchronously in the humaniser's live score bar.
 */

export type HumanMarker = {
  category: string;
  label: string;
  count: number;
  weight: number;
};

export type HumanReport = {
  /** 0–100 positive human evidence. Not the inverse of the AI score. */
  human_signal: number;
  /** 0–100 machine-pattern pressure from surface tells + uniform rhythm. */
  ai_pressure: number;
  markers: HumanMarker[];
  /** Marker categories with at least one hit. */
  categories: string[];
  words: number;
};

type Rule = { category: string; label: string; weight: number; pattern: RegExp };

/** Idiosyncrasies a language model rarely produces unprompted. */
const HUMAN_RULES: Rule[] = [
  {
    category: "contraction",
    label: "contractions",
    weight: 1.1,
    pattern: /\b\w+(?:'|’)(?:s|t|re|ve|ll|d|m)\b/gi,
  },
  {
    category: "first_person",
    label: "first-person voice",
    weight: 1.4,
    pattern: /\b(i|i'?m|i'?ve|i'?d|my|mine|myself|we'?ve|our)\b/gi,
  },
  {
    category: "colloquial",
    label: "colloquial phrasing",
    weight: 1.6,
    pattern:
      /\b(kind of|sort of|pretty much|a bit|anyway|honestly|frankly|basically|actually|to be fair|no idea|weirdly|turns out|for what it'?s worth)\b/gi,
  },
  {
    category: "hedge_natural",
    label: "natural hedging",
    weight: 1.2,
    pattern: /\b(i think|i guess|i suspect|maybe|probably|not sure|seems like|feels like)\b/gi,
  },
  {
    category: "specific",
    label: "concrete specifics",
    weight: 1.5,
    pattern:
      /\b(\d{1,2}:\d{2}|\d{4}|\$\d+|\d+%|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b/gi,
  },
  {
    category: "aside",
    label: "asides and interruptions",
    weight: 1.4,
    pattern: /(—|--|\.{3}|…|\([^)]{3,60}\))/g,
  },
  {
    category: "voice",
    label: "direct address / questions",
    weight: 1.3,
    pattern: /(\?|\byou\b|\byour\b|\blook,|\blisten,)/gi,
  },
  {
    category: "fragment",
    label: "sentence fragments",
    weight: 1.5,
    pattern: /(^|[.!?]\s)[A-Z][^.!?]{2,28}[.!?]/g,
  },
];

/** Machine-preferred phrasing — mirrors the L1 surface scanner. */
const AI_RULES: Rule[] = [
  {
    category: "transition",
    label: "generic transitions",
    weight: 1.4,
    pattern: /\b(in conclusion|furthermore|moreover|additionally|overall,|in summary)\b/gi,
  },
  {
    category: "hedging",
    label: "hedging overload",
    weight: 1.5,
    pattern:
      /\b(it is important to note|it should be noted|it is worth noting|it is widely believed)\b/gi,
  },
  {
    category: "buzzword",
    label: "buzzword stuffing",
    weight: 1.6,
    pattern:
      /\b(delve into|leverage|utilize|paradigm|holistic|robust|synergy|tapestry|testament to|underscore|multifaceted|realm of|navigate the|foster)\b/gi,
  },
  {
    category: "listicle",
    label: "listicle scaffolding",
    weight: 1.2,
    pattern: /\b(firstly|secondly|thirdly|lastly|first and foremost)\b/gi,
  },
  {
    category: "passive",
    label: "passive constructions",
    weight: 1.1,
    pattern:
      /\b(is considered to be|is defined as|can be seen as|has been shown to be|are known to be)\b/gi,
  },
  {
    category: "filler_opener",
    label: "filler openers",
    weight: 1.7,
    pattern: /\b(in today'?s world|in the modern era|with the advent of|since the dawn of)\b/gi,
  },
];

function count(rules: Rule[], text: string) {
  const markers: HumanMarker[] = [];
  let weighted = 0;
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    const hits = text.match(rule.pattern)?.length ?? 0;
    if (hits > 0) {
      markers.push({ category: rule.category, label: rule.label, count: hits, weight: rule.weight });
      weighted += hits * rule.weight;
    }
  }
  return { markers, weighted };
}

function words(text: string) {
  return (text.toLowerCase().match(/[a-z0-9']+/g) ?? []).length;
}

function rhythmVariance(text: string) {
  const sentences = (text.match(/[^.!?]+[.!?]+/g) ?? [text]).filter((s) => s.trim());
  if (sentences.length < 3) return 0.5;
  const lens = sentences.map((s) => words(s));
  const m = lens.reduce((a, b) => a + b, 0) / lens.length;
  if (!m) return 0.5;
  const sd = Math.sqrt(lens.reduce((s, x) => s + (x - m) ** 2, 0) / lens.length);
  return sd / m; // coefficient of variation
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/** Positive human-evidence report for a passage. */
export function humanReport(text: string): HumanReport {
  const w = words(text);
  if (w < 8) {
    return { human_signal: 50, ai_pressure: 50, markers: [], categories: [], words: w };
  }

  const human = count(HUMAN_RULES, text);
  const ai = count(AI_RULES, text);

  const per100 = (v: number) => (v / w) * 100;
  const density = per100(human.weighted);
  const diversity = human.markers.length; // how many *kinds* of human tell

  const cvIndex = rhythmVariance(text);
  // Human prose lands ~0.4–1.0 CV; machines cluster at 0.15–0.35.
  const rhythm = clamp(((cvIndex - 0.15) / 0.65) * 100);

  const human_signal = Math.round(
    clamp(18 + density * 9 + diversity * 5 + rhythm * 0.3 - per100(ai.weighted) * 6),
  );

  const ai_pressure = Math.round(
    clamp(12 + per100(ai.weighted) * 14 + (100 - rhythm) * 0.35 - density * 4),
  );

  return {
    human_signal,
    ai_pressure,
    markers: [...human.markers].sort((a, b) => b.count * b.weight - a.count * a.weight),
    categories: human.markers.map((m) => m.category),
    words: w,
  };
}

/** Per-sentence human evidence, used for green heatmap underlines. */
export function sentenceHumanScore(sentence: string) {
  const w = words(sentence);
  if (w < 4) return { score: 50, categories: [] as string[] };
  const human = count(HUMAN_RULES, sentence);
  const ai = count(AI_RULES, sentence);
  const score = Math.round(
    clamp(35 + (human.weighted / w) * 220 + human.markers.length * 4 - (ai.weighted / w) * 260),
  );
  return { score, categories: human.markers.map((m) => m.category) };
}

/**
 * Fast synchronous scores for the humaniser's live bar. No models, no worker —
 * it reruns on every keystroke, so keep it cheap.
 */
export function quickScore(text: string) {
  const r = humanReport(text);
  return {
    human: r.human_signal,
    ai: r.ai_pressure,
    markers: r.markers,
    words: r.words,
  };
}

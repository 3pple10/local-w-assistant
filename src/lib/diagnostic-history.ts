import type { DiagnosticResult } from "@/hooks/use-writing-diagnostic";

export type SavedRun = {
  id: string;
  createdAt: number;
  title: string;
  text: string;
  result: DiagnosticResult;
};

const KEY = "writing-diagnostic:runs";
const MAX_RUNS = 25;

function titleFor(text: string) {
  const first = text.trim().replace(/\s+/g, " ").slice(0, 60);
  return first.length ? first : "Untitled draft";
}

export function loadRuns(): SavedRun[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as SavedRun[]) : [];
  } catch {
    return [];
  }
}

function persist(runs: SavedRun[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(runs.slice(0, MAX_RUNS)));
  } catch {
    /* quota / private mode — history is best-effort */
  }
}

export function saveRun(text: string, result: DiagnosticResult): SavedRun[] {
  const run: SavedRun = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    title: titleFor(text),
    text,
    result,
  };
  const runs = [run, ...loadRuns()].slice(0, MAX_RUNS);
  persist(runs);
  return runs;
}

export function deleteRun(id: string): SavedRun[] {
  const runs = loadRuns().filter((r) => r.id !== id);
  persist(runs);
  return runs;
}

export function clearRuns(): SavedRun[] {
  persist([]);
  return [];
}

export function formatWhen(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

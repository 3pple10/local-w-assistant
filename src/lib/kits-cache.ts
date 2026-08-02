// Lightweight client-side cache for the kit list.
// Lets the library + landing page render instantly while we revalidate.
const KEY = "branddna.kits_cache.v1";

export type CachedKit = {
  id: string;
  name: string;
  source_url: string | null;
  status: string;
  created_at: string;
  primaryHex: string | null;
  palette?: string[];
  displayFont?: {
    family: string;
    google: boolean;
    source_family?: string | null;
    weights?: string[] | null;
    file_urls?: Array<{ url: string; weight?: string; style?: string; format?: string }> | null;
  } | null;
  logoUrl?: string | null;
};

export function readKitsCache(): CachedKit[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as CachedKit[];
  } catch {
    return null;
  }
}

export function writeKitsCache(kits: CachedKit[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(kits));
  } catch {
    /* quota or serialization — ignore */
  }
}

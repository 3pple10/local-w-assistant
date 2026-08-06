/**
 * Inspection + eviction for everything transformers.js stores locally:
 * the Cache Storage bucket that holds model weights, and any IndexedDB
 * databases created by the ONNX runtime / browser caches.
 */

export type CachedFile = {
  url: string;
  file: string;
  bytes: number | null;
};

export type CachedModel = {
  repo: string;
  files: CachedFile[];
  bytes: number;
};

export type CacheReport = {
  supported: boolean;
  cacheNames: string[];
  models: CachedModel[];
  totalBytes: number;
  databases: { name: string }[];
  quotaBytes: number | null;
  usedBytes: number | null;
};

function repoFromUrl(url: string) {
  try {
    const path = new URL(url).pathname.replace(/^\//, "");
    const parts = path.split("/");
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    return parts[0] || url;
  } catch {
    return url;
  }
}

function fileFromUrl(url: string) {
  try {
    const parts = new URL(url).pathname.split("/");
    return parts.slice(3).join("/") || parts[parts.length - 1];
  } catch {
    return url;
  }
}

export async function readCacheReport(): Promise<CacheReport> {
  const empty: CacheReport = {
    supported: false,
    cacheNames: [],
    models: [],
    totalBytes: 0,
    databases: [],
    quotaBytes: null,
    usedBytes: null,
  };
  if (typeof window === "undefined" || !("caches" in window)) return empty;

  const byRepo = new Map<string, CachedModel>();
  let cacheNames: string[] = [];

  try {
    cacheNames = (await caches.keys()).filter((n) => /transformers|onnx|model/i.test(n));
    for (const name of cacheNames) {
      const cache = await caches.open(name);
      const requests = await cache.keys();
      for (const req of requests) {
        const res = await cache.match(req);
        let bytes: number | null = null;
        if (res) {
          const len = res.headers.get("content-length");
          if (len) bytes = Number(len);
          else {
            try {
              bytes = (await res.clone().blob()).size;
            } catch {
              bytes = null;
            }
          }
        }
        const repo = repoFromUrl(req.url);
        const entry = byRepo.get(repo) ?? { repo, files: [], bytes: 0 };
        entry.files.push({ url: req.url, file: fileFromUrl(req.url), bytes });
        entry.bytes += bytes ?? 0;
        byRepo.set(repo, entry);
      }
    }
  } catch {
    /* storage blocked (private mode) */
  }

  let databases: { name: string }[] = [];
  try {
    const anyIdb = indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> };
    if (anyIdb.databases) {
      databases = (await anyIdb.databases())
        .map((d) => ({ name: d.name ?? "" }))
        .filter((d) => d.name);
    }
  } catch {
    /* not supported */
  }

  let quotaBytes: number | null = null;
  let usedBytes: number | null = null;
  try {
    const est = await navigator.storage?.estimate?.();
    quotaBytes = est?.quota ?? null;
    usedBytes = est?.usage ?? null;
  } catch {
    /* ignore */
  }

  const models = [...byRepo.values()].sort((a, b) => b.bytes - a.bytes);
  return {
    supported: true,
    cacheNames,
    models,
    totalBytes: models.reduce((s, m) => s + m.bytes, 0),
    databases,
    quotaBytes,
    usedBytes,
  };
}

export async function deleteModel(repo: string) {
  if (!("caches" in window)) return;
  const names = await caches.keys();
  for (const name of names) {
    const cache = await caches.open(name);
    for (const req of await cache.keys()) {
      if (repoFromUrl(req.url) === repo) await cache.delete(req);
    }
  }
}

export async function clearAllModelCaches() {
  if ("caches" in window) {
    for (const name of await caches.keys()) {
      if (/transformers|onnx|model/i.test(name)) await caches.delete(name);
    }
  }
  try {
    const anyIdb = indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> };
    const dbs = anyIdb.databases ? await anyIdb.databases() : [];
    for (const db of dbs) {
      if (db.name && /transformers|onnx|model|keyval/i.test(db.name)) {
        indexedDB.deleteDatabase(db.name);
      }
    }
  } catch {
    /* ignore */
  }
}

export function formatBytes(bytes: number | null) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

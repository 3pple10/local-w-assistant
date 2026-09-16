// Front-end validation + sanitisation for the local CLI wrapper payload.
// Everything here runs before a request ever reaches the local backend.

export const QUALITY_PRESETS = [
  { value: "best", label: "Best available" },
  { value: "2160p", label: "4K (2160p)" },
  { value: "1080p", label: "1080p" },
  { value: "720p", label: "720p" },
  { value: "audio", label: "Audio only" },
] as const;

export const CONTAINER_FORMATS = [
  { value: "mp4", label: "MP4" },
  { value: "mkv", label: "MKV" },
  { value: "webm", label: "WEBM" },
  { value: "mp3", label: "MP3" },
  { value: "flac", label: "FLAC" },
] as const;

export const AUDIO_CONTAINERS = new Set(["mp3", "flac"]);

export const COOKIE_SOURCES = [
  { value: "none", label: "None" },
  { value: "chrome", label: "Chrome" },
  { value: "firefox", label: "Firefox" },
  { value: "brave", label: "Brave" },
  { value: "edge", label: "Edge" },
  { value: "safari", label: "Safari" },
] as const;

export interface DownloadPayload {
  urls: string[];
  quality: string;
  format: string;
  audioOnly: boolean;
  embedSubtitles: boolean;
  isPlaylist: boolean;
  outputDirectory: string;
  customFilename: string;
  cookiesFromBrowser: string;
}

// Characters that could break out of an argument if the backend ever touches a
// shell. Note: `?`, `=`, `&`, `#`, `%` are legal and common in real links, so
// they are NOT blocked here — the backend must spawn without a shell.
const URL_UNSAFE = /[\s;`$|<>\\"'\n\r\t()]|[\u0000-\u001f]/;
// Paths and naming patterns never need these.
const SHELL_METACHARS = /[;&|`$><\n\r\\!*?(){}[\]'"]/;

/* ------------------------------------------------------------------ */
/* URL cleaning                                                        */
/* ------------------------------------------------------------------ */

export type Platform = "YouTube" | "Instagram" | "X" | "Facebook" | "TikTok" | "Link";

export function detectPlatform(url: string): Platform {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "Link";
  }
  if (/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(host)) return "YouTube";
  if (/(^|\.)instagram\.com$/.test(host)) return "Instagram";
  if (/(^|\.)(twitter\.com|x\.com|t\.co)$/.test(host)) return "X";
  if (/(^|\.)(facebook\.com|fb\.watch|fb\.com)$/.test(host)) return "Facebook";
  if (/(^|\.)tiktok\.com$/.test(host)) return "TikTok";
  return "Link";
}

// Params that are tracking, share tags or playback offsets — never needed.
const JUNK_PARAMS = [
  /^utm_/i,
  /^si$/i,
  /^feature$/i,
  /^pp$/i,
  /^t$/i,
  /^start$/i,
  /^end$/i,
  /^time_continue$/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^igshid$/i,
  /^igsh$/i,
  /^img_index$/i,
  /^ref(_src|_url)?$/i,
  /^s$/i,
  /^src$/i,
  /^source$/i,
  /^share/i,
  /^_r$/i,
  /^_t$/i,
  /^is_from_webapp$/i,
  /^sender_device$/i,
  /^web_id$/i,
  /^mibextid$/i,
  /^rdid$/i,
  /^context$/i,
  /^app$/i,
];

const KEEP_ALWAYS = new Set(["v", "list", "index", "id", "story_fbid", "story_id"]);

/** Strips tracking params, timestamps and share tags. Returns the tidy link. */
export function sanitizeUrl(raw: string): string {
  const value = raw.trim().replace(/[\u200b-\u200f\uFEFF]/g, "");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return value;
  }
  parsed.hash = "";
  const keys = Array.from(parsed.searchParams.keys());
  for (const key of keys) {
    if (KEEP_ALWAYS.has(key)) continue;
    if (JUNK_PARAMS.some((re) => re.test(key))) parsed.searchParams.delete(key);
  }
  const platform = detectPlatform(value);
  if (platform === "Instagram" || platform === "X" || platform === "TikTok") {
    parsed.search = "";
  }
  let out = parsed.toString();
  if (!parsed.search) out = out.replace(/\?$/, "");
  return out.replace(/\/$/, (m, i: number) => (i > 8 ? "" : m));
}

export function validateUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return "Empty URL.";
  if (URL_UNSAFE.test(value)) return "URL contains characters that are not allowed.";
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "Not a valid URL.";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    return "Only http and https links are supported.";
  if (value.length > 2048) return "URL is too long.";
  return null;
}

export function parseUrls(raw: string): string[] {
  return raw
    .split(/[\n,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function validateFilename(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.length > 200) return "Naming pattern is too long.";
  if (/[;&|`$><\n\r\\!'"]/.test(value)) return "Naming pattern contains unsafe characters.";
  if (value.includes("..")) return "Naming pattern cannot walk up directories.";
  return null;
}


export function validateDirectory(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.length > 400) return "Path is too long.";
  if (SHELL_METACHARS.test(value)) return "Path contains unsafe characters.";
  if (value.includes("..")) return "Path cannot walk up directories.";
  return null;
}

export interface FormState {
  urlsRaw: string;
  quality: string;
  format: string;
  audioOnly: boolean;
  embedSubtitles: boolean;
  isPlaylist: boolean;
  outputDirectory: string;
  customFilename: string;
}

export interface BuildResult {
  payload?: DownloadPayload;
  errors: string[];
}

export function buildPayload(state: FormState): BuildResult {
  const errors: string[] = [];
  const urls = parseUrls(state.urlsRaw);
  if (urls.length === 0) errors.push("Add at least one video link.");
  if (urls.length > 100) errors.push("Batch is limited to 100 links at a time.");
  urls.forEach((u) => {
    const err = validateUrl(u);
    if (err) errors.push(`${u.slice(0, 60)} — ${err}`);
  });
  const fileErr = validateFilename(state.customFilename);
  if (fileErr) errors.push(fileErr);
  const dirErr = validateDirectory(state.outputDirectory);
  if (dirErr) errors.push(dirErr);
  if (errors.length) return { errors };

  const audioOnly = state.audioOnly || state.quality === "audio";
  return {
    errors: [],
    payload: {
      urls,
      quality: audioOnly ? "audio" : state.quality,
      format: audioOnly && !AUDIO_CONTAINERS.has(state.format) ? "mp3" : state.format,
      audioOnly,
      embedSubtitles: audioOnly ? false : state.embedSubtitles,
      isPlaylist: state.isPlaylist,
      outputDirectory: state.outputDirectory.trim(),
      customFilename: state.customFilename.trim(),
    },
  };
}

// Mirrors the flags the local backend is expected to hand to yt-dlp, so the
// user can see the command before running it.
export function previewCommand(p: DownloadPayload): string {
  const flags: string[] = [];
  if (p.audioOnly) {
    flags.push("-x", `--audio-format ${p.format}`, "--audio-quality 0");
  } else {
    const height =
      p.quality === "best" ? null : Number(p.quality.replace(/\D/g, "")) || null;
    flags.push(
      `-f "${height ? `bv*[height<=${height}]+ba/b[height<=${height}]` : "bv*+ba/b"}"`,
      `--merge-output-format ${p.format}`,
    );
    if (p.embedSubtitles) flags.push("--write-auto-subs", "--embed-subs");
  }
  flags.push(p.isPlaylist ? "--yes-playlist" : "--no-playlist");
  const name = p.customFilename || "%(title)s - %(uploader)s.%(ext)s";
  const dir = p.outputDirectory ? `${p.outputDirectory.replace(/\/$/, "")}/` : "";
  flags.push(`-o "${dir}${name}"`);
  return `yt-dlp ${flags.join(" ")} ${p.urls.map((u) => `"${u}"`).join(" ")}`;
}

// Local download service bundled with the desktop app.
// Listens on 127.0.0.1:3000 and speaks the same API the Fetcher page expects:
//   POST /api/download          -> { jobId }
//   GET  /api/download/stream   -> SSE of stdout/stderr
//   POST /api/download/cancel   -> kills the child process
// yt-dlp is spawned WITHOUT a shell, so arguments can never be re-interpreted.

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { randomUUID } = require("crypto");

const jobs = new Map(); // id -> { child, listeners:Set<res>, buffer:[], done:boolean }

const ALLOWED_QUALITY = new Set(["best", "2160p", "1080p", "720p", "audio"]);
const ALLOWED_FORMAT = new Set(["mp4", "mkv", "webm", "mp3", "flac"]);
const ALLOWED_COOKIES = new Set(["chrome", "firefox", "brave", "edge", "safari"]);
const UNSAFE = /[\s;`$|<>\\"'\n\r\t]/;
const UPDATE_TIMEOUT_MS = 45_000;
let managedExecutable = null;
let updatePromise = null;
let updateStatus = "bundled";

function executable(name) {
  if (name === "yt-dlp" && managedExecutable) return managedExecutable;
  const suffix = process.platform === "win32" ? ".exe" : "";
  const bundled = path.join(__dirname, "bin", `${name}${suffix}`);
  return fs.existsSync(bundled) ? bundled : name;
}

function runCapture(command, args, timeout = UPDATE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: false });
    let output = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeout);
    child.stdout.on("data", (chunk) => (output += String(chunk)));
    child.stderr.on("data", (chunk) => (output += String(chunk)));
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: -1, output: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, output });
    });
  });
}

async function prepareExecutable(runtimeDir) {
  const bundled = executable("yt-dlp");
  if (!runtimeDir || bundled === "yt-dlp") return;
  const suffix = process.platform === "win32" ? ".exe" : "";
  fs.mkdirSync(runtimeDir, { recursive: true });
  const runtime = path.join(runtimeDir, `yt-dlp${suffix}`);
  if (!fs.existsSync(runtime)) {
    fs.copyFileSync(bundled, runtime);
    if (process.platform !== "win32") fs.chmodSync(runtime, 0o755);
  }
  managedExecutable = runtime;
  updateStatus = "checking";
  updatePromise = runCapture(runtime, ["--update-to", "nightly"])
    .then((result) => {
      updateStatus = result.code === 0 ? "ready" : "update-failed";
      return result;
    })
    .catch(() => {
      updateStatus = "update-failed";
    });
}

// Bundled ffmpeg (if shipped) so merging and audio conversion need no install.
function bundledFfmpegDir() {
  const suffix = process.platform === "win32" ? ".exe" : "";
  const file = path.join(__dirname, "bin", `ffmpeg${suffix}`);
  return require("fs").existsSync(file) ? path.dirname(file) : null;
}

function buildArgs(p) {
  const args = [];
  const ffmpegDir = bundledFfmpegDir();
  if (ffmpegDir) args.push("--ffmpeg-location", ffmpegDir);
  const audioOnly = Boolean(p.audioOnly) || p.quality === "audio";
  const format = ALLOWED_FORMAT.has(p.format) ? p.format : audioOnly ? "mp3" : "mp4";

  if (audioOnly) {
    args.push("-x", "--audio-format", format, "--audio-quality", "0");
  } else {
    const quality = ALLOWED_QUALITY.has(p.quality) ? p.quality : "best";
    const height = quality === "best" ? null : Number(quality.replace(/\D/g, "")) || null;
    args.push(
      "-f",
      height ? `bv*[height<=${height}]+ba/b[height<=${height}]` : "bv*+ba/b",
      "--merge-output-format",
      format,
    );
    if (p.embedSubtitles) args.push("--write-auto-subs", "--embed-subs");
  }

  args.push(
    p.isPlaylist ? "--yes-playlist" : "--no-playlist",
    "--newline",
    "--progress",
    "--no-colors",
    "--progress-template",
    "download:[progress] %(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s",
    "--retries",
    "3",
    "--fragment-retries",
    "3",
  );

  if (p.cookiesFromBrowser && ALLOWED_COOKIES.has(p.cookiesFromBrowser)) {
    args.push("--cookies-from-browser", p.cookiesFromBrowser);
  }

  const name =
    typeof p.customFilename === "string" && p.customFilename.trim()
      ? p.customFilename.trim()
      : "%(title)s - %(uploader)s.%(ext)s";
  const dir =
    typeof p.outputDirectory === "string" && p.outputDirectory.trim()
      ? p.outputDirectory.trim()
      : path.join(os.homedir(), "Downloads");
  if (name.includes("..") || dir.includes("..")) throw new Error("Unsafe output path.");
  args.push("-o", path.join(dir, name));

  const urls = Array.isArray(p.urls) ? p.urls : [];
  if (!urls.length) throw new Error("No links supplied.");
  if (urls.length > 100) throw new Error("Too many links.");
  for (const u of urls) {
    if (typeof u !== "string" || UNSAFE.test(u) || !/^https?:\/\//i.test(u))
      throw new Error(`Rejected link: ${String(u).slice(0, 80)}`);
  }
  args.push("--", ...urls);
  return args;
}

function withoutBrowserCookies(args) {
  const copy = [...args];
  const index = copy.indexOf("--cookies-from-browser");
  if (index >= 0) copy.splice(index, 2);
  return copy;
}

function emit(job, line, stream) {
  const frame = `data: ${JSON.stringify({ line, stream })}\n\n`;
  job.buffer.push(frame);
  if (job.buffer.length > 800) job.buffer.shift();
  for (const res of job.listeners) res.write(frame);
}

function spawnAttempt(job, args, onClose) {
  const child = spawn(executable("yt-dlp"), args, { shell: false });
  job.child = child;
  job.output = "";
  const buffers = { stdout: "", stderr: "" };
  const flush = (stream, chunk, final = false) => {
    buffers[stream] += chunk;
    const parts = buffers[stream].split(/\r?\n|\r/);
    buffers[stream] = final ? "" : (parts.pop() ?? "");
    if (final && buffers[stream]) parts.push(buffers[stream]);
    for (const line of parts.filter(Boolean)) {
      job.output += `${line}\n`;
      emit(job, line, stream);
    }
  };
  child.stdout.on("data", (data) => flush("stdout", String(data)));
  child.stderr.on("data", (data) => flush("stderr", String(data)));
  child.on("error", (error) => {
    emit(
      job,
      error.code === "ENOENT"
        ? "The bundled downloader is missing. Download a fresh desktop bundle."
        : `Failed to start the downloader: ${error.message}`,
      "stderr",
    );
  });
  child.on("close", (code) => {
    flush("stdout", "", true);
    flush("stderr", "", true);
    onClose(code ?? 1);
  });
}

function complete(job, code) {
  job.done = true;
  job.exitCode = code;
  const result = { code, status: code === 0 ? "completed" : "failed" };
  const frame = `event: done\ndata: ${JSON.stringify(result)}\n\n`;
  for (const response of job.listeners) {
    response.write(frame);
    response.end();
  }
  job.listeners.clear();
  setTimeout(() => jobs.delete(job.id), 60_000);
}

function runJob(job, args, canRetryWithoutCookies) {
  spawnAttempt(job, args, (code) => {
    const cookieFailure = /page needs to be reloaded/i.test(job.output);
    if (code !== 0 && canRetryWithoutCookies && cookieFailure) {
      emit(
        job,
        "[recovery] YouTube rejected the browser session. Retrying this public video without browser cookies…",
        "stderr",
      );
      return runJob(job, withoutBrowserCookies(args), false);
    }
    complete(job, code);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1e6) reject(new Error("Body too large"));
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch (e) {
        reject(e);
      }
    });
  });
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");

    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS);
      return res.end();
    }

    if (req.method === "POST" && url.pathname === "/api/download") {
      let args;
      try {
        args = buildArgs(await readBody(req));
      } catch (err) {
        res.writeHead(400, { ...CORS, "Content-Type": "text/plain" });
        return res.end(err.message);
      }
      if (updatePromise) await updatePromise;
      const id = randomUUID();
      const job = { id, listeners: new Set(), buffer: [], done: false, child: null, output: "" };
      jobs.set(id, job);
      runJob(job, args, args.includes("--cookies-from-browser"));

      res.writeHead(200, { ...CORS, "Content-Type": "application/json" });
      return res.end(JSON.stringify({ jobId: id }));
    }

    if (req.method === "GET" && url.pathname === "/api/download/stream") {
      const job = jobs.get(url.searchParams.get("jobId"));
      res.writeHead(200, {
        ...CORS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      if (!job) {
        res.write('data: {"line":"Unknown job.","stream":"stderr"}\n\n');
        res.write("event: done\ndata: {}\n\n");
        return res.end();
      }
      job.buffer.forEach((f) => res.write(f));
      if (job.done) {
        res.write(
          `event: done\ndata: ${JSON.stringify({ code: job.exitCode, status: job.exitCode === 0 ? "completed" : "failed" })}\n\n`,
        );
        return res.end();
      }
      job.listeners.add(res);
      req.on("close", () => job.listeners.delete(res));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/download/cancel") {
      const body = await readBody(req).catch(() => ({}));
      const job = jobs.get(body.jobId);
      if (job?.child && !job.done) job.child.kill("SIGTERM");
      res.writeHead(200, { ...CORS, "Content-Type": "application/json" });
      return res.end(JSON.stringify({ cancelled: Boolean(job) }));
    }

    if (url.pathname === "/api/health") {
      res.writeHead(200, { ...CORS, "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, updater: updateStatus }));
    }

    res.writeHead(404, CORS);
    res.end("Not found");
  });
}

function start(port = 3000, options = {}) {
  prepareExecutable(options.runtimeDir).catch(() => {
    updateStatus = "update-failed";
  });
  const server = createServer();
  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once("error", onError);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", onError);
      resolve(server);
    });
  });
}

function killAll() {
  for (const job of jobs.values()) if (job.child && !job.done) job.child.kill("SIGTERM");
}

module.exports = { start, killAll, buildArgs, createServer };

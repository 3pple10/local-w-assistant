// Local download service bundled with the desktop app.
// Listens on 127.0.0.1:3000 and speaks the same API the Fetcher page expects:
//   POST /api/download          -> { jobId }
//   GET  /api/download/stream   -> SSE of stdout/stderr
//   POST /api/download/cancel   -> kills the child process
// yt-dlp is spawned WITHOUT a shell, so arguments can never be re-interpreted.

const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { randomUUID } = require("crypto");

const jobs = new Map(); // id -> { child, listeners:Set<res>, buffer:[], done:boolean }

const ALLOWED_QUALITY = new Set(["best", "2160p", "1080p", "720p", "audio"]);
const ALLOWED_FORMAT = new Set(["mp4", "mkv", "webm", "mp3", "flac"]);
const ALLOWED_COOKIES = new Set(["chrome", "firefox", "brave", "edge", "safari"]);
const UNSAFE = /[\s;`$|<>\\"'\n\r\t]/;

function executable(name) {
  const suffix = process.platform === "win32" ? ".exe" : "";
  const bundled = path.join(__dirname, "bin", `${name}${suffix}`);
  return require("fs").existsSync(bundled) ? bundled : name;
}

function buildArgs(p) {
  const args = [];
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

  args.push(p.isPlaylist ? "--yes-playlist" : "--no-playlist", "--newline", "--progress");

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

function emit(job, line, stream) {
  const frame = `data: ${JSON.stringify({ line, stream })}\n\n`;
  job.buffer.push(frame);
  if (job.buffer.length > 800) job.buffer.shift();
  for (const res of job.listeners) res.write(frame);
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
      const id = randomUUID();
      const job = { listeners: new Set(), buffer: [], done: false, child: null };
      jobs.set(id, job);

      const child = spawn(executable("yt-dlp"), args, { shell: false });
      job.child = child;
      child.stdout.on("data", (d) =>
        String(d)
          .split(/\r?\n/)
          .filter(Boolean)
          .forEach((l) => emit(job, l, "stdout")),
      );
      child.stderr.on("data", (d) =>
        String(d)
          .split(/\r?\n/)
          .filter(Boolean)
          .forEach((l) => emit(job, l, "stderr")),
      );
      child.on("error", (err) => {
        emit(
          job,
          err.code === "ENOENT"
            ? "yt-dlp is not installed or not on PATH."
            : `Failed to start yt-dlp: ${err.message}`,
          "stderr",
        );
      });
      child.on("close", (code) => {
        job.done = true;
        emit(job, `[exit ${code}]`, "stdout");
        const frame = "event: done\ndata: {}\n\n";
        for (const r of job.listeners) {
          r.write(frame);
          r.end();
        }
        job.listeners.clear();
        setTimeout(() => jobs.delete(id), 60_000);
      });

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
        res.write("event: done\ndata: {}\n\n");
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
      return res.end(JSON.stringify({ ok: true }));
    }

    res.writeHead(404, CORS);
    res.end("Not found");
  });
}

function start(port = 3000) {
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

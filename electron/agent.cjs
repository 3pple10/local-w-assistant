// Local app-builder agent: desktop side.
// - Every app lives in ~/Workbench Apps/<slug>; nothing outside that folder is ever touched.
// - Model calls (local runners or the user's own cloud key) go out from here, never from the page.
// - Cloud keys are encrypted with the OS keychain (safeStorage).
// - Each app gets a tiny local database (data.json) served at /__db by its preview server.

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const APPS = path.join(os.homedir(), "Workbench Apps");
const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;
const FILE = /^[A-Za-z0-9_-]+\.(html|css|js|json|md)$/;
const MIME = { html: "text/html", css: "text/css", js: "text/javascript", json: "application/json", md: "text/plain" };
const previews = new Map();

function appDir(slug) {
  if (!SLUG.test(String(slug))) throw new Error("Invalid app name.");
  return path.join(APPS, slug);
}
function appFile(slug, rel) {
  if (!FILE.test(String(rel))) throw new Error(`File name not allowed: ${rel}`);
  return path.join(appDir(slug), rel);
}

const DB_JS = `window.db={get:async(k)=>{const r=await fetch('/__db?k='+encodeURIComponent(k));return r.ok?(await r.json()).v:null},set:async(k,v)=>{await fetch('/__db?k='+encodeURIComponent(k),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({v})})},all:async()=>{const r=await fetch('/__db');return r.json()}};`;

function startPreview(slug) {
  if (previews.has(slug)) return Promise.resolve(previews.get(slug));
  const dir = appDir(slug);
  const dbFile = path.join(dir, "data.json");
  const readDb = () => {
    try { return JSON.parse(fs.readFileSync(dbFile, "utf8")); } catch { return {}; }
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/__db") {
      const k = url.searchParams.get("k");
      const db = readDb();
      if (req.method === "POST" && k) {
        let body = "";
        req.on("data", (c) => { body += c; if (body.length > 2e6) req.destroy(); });
        req.on("end", () => {
          try { db[k] = JSON.parse(body).v; fs.writeFileSync(dbFile, JSON.stringify(db, null, 2)); res.end("{}"); }
          catch { res.statusCode = 400; res.end("{}"); }
        });
        return;
      }
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify(k ? { v: db[k] ?? null } : db));
    }
    if (url.pathname === "/db.js") { res.setHeader("Content-Type", "text/javascript"); return res.end(DB_JS); }
    const name = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (!FILE.test(name) || name === "data.json") { res.statusCode = 404; return res.end(); }
    fs.readFile(path.join(dir, name), (err, buf) => {
      if (err) { res.statusCode = 404; return res.end(); }
      res.setHeader("Content-Type", MIME[name.split(".").pop()]);
      res.end(buf);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${server.address().port}/`;
    previews.set(slug, url);
    resolve(url);
  }));
}

function register(ipcMain, { app, BrowserWindow, shell, safeStorage }) {
  const settingsFile = () => path.join(app.getPath("userData"), "agent.json");
  const readSettings = () => {
    try { return JSON.parse(fs.readFileSync(settingsFile(), "utf8")); } catch { return {}; }
  };
  const getKey = (s) => {
    if (!s.keyEnc) return "";
    try { return safeStorage.decryptString(Buffer.from(s.keyEnc, "base64")); } catch { return ""; }
  };

  ipcMain.handle("agent-settings-get", () => {
    const s = readSettings();
    return { baseURL: s.baseURL || "", model: s.model || "", plannerModel: s.plannerModel || "", hasKey: Boolean(s.keyEnc) };
  });
  ipcMain.handle("agent-settings-set", (_e, next) => {
    const s = readSettings();
    const out = {
      baseURL: String(next.baseURL || "").trim().replace(/\/+$/, ""),
      model: String(next.model || "").trim(),
      plannerModel: String(next.plannerModel || "").trim(),
      keyEnc: s.keyEnc,
    };
    if (!/^https?:\/\//.test(out.baseURL)) throw new Error("The address must start with http:// or https://");
    if (typeof next.key === "string") {
      if (!next.key) out.keyEnc = undefined;
      else if (safeStorage.isEncryptionAvailable()) out.keyEnc = safeStorage.encryptString(next.key).toString("base64");
      else throw new Error("This computer's keychain isn't available, so the key can't be stored safely.");
    }
    fs.writeFileSync(settingsFile(), JSON.stringify(out, null, 2));
    return true;
  });

  ipcMain.handle("agent-detect", async () => {
    const found = [];
    for (const [name, base] of [["Ollama", "http://127.0.0.1:11434/v1"], ["LM Studio", "http://127.0.0.1:1234/v1"]]) {
      try {
        const r = await fetch(`${base}/models`, { signal: AbortSignal.timeout(1500) });
        if (r.ok) found.push({ name, baseURL: base, models: ((await r.json()).data || []).map((m) => m.id).slice(0, 50) });
      } catch { /* not running */ }
    }
    return found;
  });

  ipcMain.handle("agent-llm", async (_e, { messages, role }) => {
    const s = readSettings();
    if (!s.baseURL || !s.model) throw new Error("Choose a model source first.");
    const model = role === "planner" && s.plannerModel ? s.plannerModel : s.model;
    const headers = { "Content-Type": "application/json" };
    const key = getKey(s);
    if (key) headers.Authorization = `Bearer ${key}`;
    const r = await fetch(`${s.baseURL}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, messages: Array.isArray(messages) ? messages.slice(0, 20) : [], stream: false }),
    });
    const text = await r.text();
    if (!r.ok) {
      let msg = text.slice(0, 300);
      try { const j = JSON.parse(text); msg = j.error?.message || j.message || msg; } catch { /* keep */ }
      throw new Error(`${r.status}: ${msg}`);
    }
    return JSON.parse(text).choices?.[0]?.message?.content ?? "";
  });

  // ---- Jcode harness (bundled binary, Mac builds only) ----
  const jcodeBin = () => {
    const name = process.platform === "win32" ? "jcode.exe" : "jcode";
    const p = path.join(__dirname, "bin", name).replace("app.asar", "app.asar.unpacked");
    return fs.existsSync(p) ? p : null;
  };
  let jcodeJob = null;

  ipcMain.handle("jcode-status", () => {
    const bin = jcodeBin();
    if (!bin) return { available: false };
    const out = require("child_process").spawnSync(bin, ["version"], { encoding: "utf8", timeout: 8000 });
    return { available: true, version: (out.stdout || "").trim().split("\n")[0] || "unknown" };
  });

  ipcMain.handle("jcode-run", (e, { slug, message }) => {
    const bin = jcodeBin();
    if (!bin) throw new Error("Jcode isn't included in this version of the app.");
    if (jcodeJob) throw new Error("Jcode is already working on something.");
    const s = readSettings();
    let provider = null;
    if (/:11434\b/.test(s.baseURL || "")) provider = "ollama";
    else if (/:1234\b/.test(s.baseURL || "")) provider = "lmstudio";
    if (!provider || !s.model) throw new Error("Jcode runs offline only: pick Ollama or LM Studio under Local runner first.");
    const dir = appDir(slug);
    fs.mkdirSync(dir, { recursive: true });
    const text = String(message || "").slice(0, 8000);
    if (!text.trim()) throw new Error("Describe what to build.");
    // No shell tool: Jcode can only read and edit files inside this app's folder.
    const args = ["run", "--provider", provider, "--model", s.model, "--cwd", dir, "--tools", "read,write,apply_patch", "--ndjson", "--no-update", "--no-selfdev", text];
    const child = require("child_process").spawn(bin, args, { cwd: dir, shell: false, env: { ...process.env, HOME: os.homedir() } });
    jcodeJob = child;
    const send = (type, data) => { if (!e.sender.isDestroyed()) e.sender.send("jcode-event", { type, data }); };
    const lines = (stream, type) => {
      let buf = "";
      stream.on("data", (c) => {
        buf += c.toString();
        const parts = buf.split("\n");
        buf = parts.pop();
        for (const l of parts) if (l.trim()) send(type, l);
      });
    };
    lines(child.stdout, "out");
    lines(child.stderr, "err");
    child.on("close", (code) => { jcodeJob = null; send("done", code); });
    child.on("error", (err) => { jcodeJob = null; send("done", String(err.message)); });
    return true;
  });

  ipcMain.handle("jcode-cancel", () => { if (jcodeJob) jcodeJob.kill("SIGTERM"); return true; });

  ipcMain.handle("agent-list-apps", () => {
    fs.mkdirSync(APPS, { recursive: true });
    return fs.readdirSync(APPS, { withFileTypes: true })
      .filter((d) => d.isDirectory() && SLUG.test(d.name))
      .map((d) => ({ slug: d.name, files: fs.readdirSync(path.join(APPS, d.name)).filter((f) => FILE.test(f) && f !== "data.json") }));
  });
  ipcMain.handle("agent-read", (_e, slug, rel) => {
    try { return fs.readFileSync(appFile(slug, rel), "utf8"); } catch { return null; }
  });
  ipcMain.handle("agent-write", (_e, slug, files) => {
    fs.mkdirSync(appDir(slug), { recursive: true });
    for (const f of Array.isArray(files) ? files.slice(0, 10) : []) {
      if (typeof f.content !== "string" || f.content.length > 500_000) throw new Error(`${f.path} is too large.`);
      fs.writeFileSync(appFile(slug, f.path), f.content);
    }
    return true;
  });
  ipcMain.handle("agent-delete-app", async (_e, slug) => {
    await shell.trashItem(appDir(slug));
    return true;
  });
  ipcMain.handle("agent-preview", async (_e, slug) => {
    const url = await startPreview(slug);
    const w = new BrowserWindow({ width: 1000, height: 760, title: slug, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    await w.loadURL(url);
    return url;
  });
  ipcMain.handle("agent-reveal", (_e, slug) => shell.openPath(appDir(slug)));
}

module.exports = { register };

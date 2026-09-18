// Runs the built app inside the desktop window without any external web server.
// The production build exposes a fetch handler; we hand it real requests and
// serve the static files ourselves.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function assetResponse(clientDir, pathname) {
  const relative = decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = path.join(clientDir, relative);
  if (!file.startsWith(clientDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return null;
  }
  return new Response(fs.readFileSync(file), {
    headers: { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" },
  });
}

async function start({ distDir, port = 4173 }) {
  const clientDir = path.join(distDir, "client");
  const entry = pathToFileURL(path.join(distDir, "server", "index.mjs")).href;
  const handler = (await import(entry)).default;

  const env = {
    ...process.env,
    ASSETS: { fetch: (request) => assetResponse(clientDir, new URL(request.url).pathname) },
  };
  const ctx = { waitUntil() {}, passThroughOnException() {} };

  const server = http.createServer(async (req, res) => {
    const url = `http://127.0.0.1:${port}${req.url}`;
    try {
      const direct = assetResponse(clientDir, new URL(url).pathname);
      let response = direct;
      if (!response) {
        const body =
          req.method === "GET" || req.method === "HEAD"
            ? undefined
            : await new Promise((resolve) => {
                const chunks = [];
                req.on("data", (c) => chunks.push(c));
                req.on("end", () => resolve(Buffer.concat(chunks)));
              });
        response = await handler.fetch(
          new Request(url, { method: req.method, headers: req.headers, body, duplex: "half" }),
          env,
          ctx,
        );
      }
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`Application error: ${error?.message || error}`);
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return { server, url: `http://127.0.0.1:${port}` };
}

module.exports = { start };

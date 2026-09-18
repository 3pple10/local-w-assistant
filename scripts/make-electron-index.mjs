// The web build is server-rendered, but the desktop window loads files directly,
// so we generate a small entry page that boots the same app in the window.

import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const client = path.join(here, "..", "dist", "client");
const files = await readdir(path.join(client, "assets"));

const entry = files.find((f) => /^main-.*\.js$/.test(f));
const css = files.filter((f) => f.endsWith(".css"));
if (!entry) throw new Error("Could not find the client entry bundle in dist/client/assets");

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Writing Diagnostic</title>
${css.map((f) => `    <link rel="stylesheet" href="./assets/${f}" />`).join("\n")}
  </head>
  <body>
    <script type="module" src="./assets/${entry}"></script>
  </body>
</html>
`;

await writeFile(path.join(client, "index.html"), html);
console.log(`Desktop entry written with ${entry}`);

#!/usr/bin/env node
// Regression check: every `buildBrandPDF(` call site must be awaited.
// Fails (exit 1) if any call appears without a preceding `await` (directly,
// or via being an element of an `await Promise.all([...])` / `Promise.allSettled([...])`).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
const TARGET = "buildBrandPDF";
const EXPR_MAX = 200;
const SNIPPET_CONTEXT = 2;

/** Recursively collect .ts/.tsx/.js/.mjs files under dir. */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(name)) out.push(p);
  }
  return out;
}

/** Strip line/block comments and string literals so we don't match inside them. */
export function sanitize(source) {
  let out = "";
  let i = 0;
  const n = source.length;
  let state = "code"; // 'code' | 'line' | 'block' | 'sq' | 'dq' | 'tpl'
  while (i < n) {
    const c = source[i];
    const c2 = source[i + 1];
    if (state === "code") {
      if (c === "/" && c2 === "/") { state = "line"; out += "  "; i += 2; continue; }
      if (c === "/" && c2 === "*") { state = "block"; out += "  "; i += 2; continue; }
      if (c === "'") { state = "sq"; out += " "; i++; continue; }
      if (c === '"') { state = "dq"; out += " "; i++; continue; }
      if (c === "`") { state = "tpl"; out += " "; i++; continue; }
      out += c; i++; continue;
    }
    if (state === "line") {
      if (c === "\n") { state = "code"; out += "\n"; i++; continue; }
      out += c === "\n" ? "\n" : " "; i++; continue;
    }
    if (state === "block") {
      if (c === "*" && c2 === "/") { state = "code"; out += "  "; i += 2; continue; }
      out += c === "\n" ? "\n" : " "; i++; continue;
    }
    if (state === "sq" || state === "dq" || state === "tpl") {
      const quote = state === "sq" ? "'" : state === "dq" ? '"' : "`";
      if (c === "\\") { out += "  "; i += 2; continue; }
      if (c === quote) { state = "code"; out += " "; i++; continue; }
      out += c === "\n" ? "\n" : " "; i++; continue;
    }
  }
  return out;
}

/**
 * Walk `code` (sanitized) from `openParenIdx` (a `(` position) to find the
 * matching `)`. Returns the index of the closing paren, or -1 if unbalanced.
 */
function findMatchingParen(code, openParenIdx) {
  let depth = 0;
  for (let i = openParenIdx; i < code.length; i++) {
    const c = code[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Pure detection. Returns an array of violation objects for every un-awaited
 * call site of `target` in `source`.
 *
 * Each violation: `{ line, column, text, expression, snippet }` where
 * `snippet` is `[{ lineNo, source }]` for ±2 lines around the call.
 */
export function findUnawaitedCalls(source, target = TARGET) {
  const code = sanitize(source);
  const re = new RegExp(`\\b${target}\\s*\\(`, "g");
  const lines = source.split("\n");
  const violations = [];
  let m;
  while ((m = re.exec(code)) !== null) {
    const idx = m.index;
    const lineStart = code.lastIndexOf("\n", idx - 1) + 1;
    const lineEnd = code.indexOf("\n", idx);
    const lineNo = code.slice(0, idx).split("\n").length;
    const column = idx - lineStart + 1;
    const lineText = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd);

    // Skip the declaration: `function buildBrandPDF(`
    const before = code.slice(Math.max(0, idx - 80), idx);
    if (/\bfunction\s+$/.test(before)) continue;

    // Skip imports / re-exports.
    if (/^\s*import\b/.test(lineText)) continue;
    if (/^\s*export\s+\{/.test(lineText)) continue;

    // Look back for an `await`.
    const window = code.slice(Math.max(0, idx - 400), idx).replace(/\s+/g, " ");
    if (/\bawait\s*\(?\s*$/.test(window)) continue;
    const awaitAllMatch = window.match(/\bawait\s+Promise\.(all|allSettled)\s*\(\s*\[[^\]]*$/);
    if (awaitAllMatch) continue;

    // Build the exact call expression by walking from the matched `(`.
    const openParen = idx + m[0].length - 1;
    const closeParen = findMatchingParen(code, openParen);
    let expression;
    if (closeParen === -1) {
      expression = lineText.trim();
    } else {
      expression = source.slice(idx, closeParen + 1);
      if (expression.length > EXPR_MAX) {
        expression = expression.slice(0, EXPR_MAX - 1) + "…";
      }
    }

    // Snippet: ±SNIPPET_CONTEXT lines around the call (clamped).
    const start = Math.max(1, lineNo - SNIPPET_CONTEXT);
    const end = Math.min(lines.length, lineNo + SNIPPET_CONTEXT);
    const snippet = [];
    for (let ln = start; ln <= end; ln++) {
      snippet.push({ lineNo: ln, source: lines[ln - 1] ?? "" });
    }

    violations.push({
      line: lineNo,
      column,
      text: lineText.trim(),
      expression,
      snippet,
    });
  }
  return violations;
}

/** Render a violation block (snippet + caret + fix hint) for the CLI. */
function renderViolation(v) {
  const out = [];
  out.push(`  ${v.file}:${v.line}:${v.column}`);
  out.push(`    Call: ${v.expression}`);
  out.push("");
  const gutter = (n) => String(n).padStart(4, " ");
  for (const { lineNo, source } of v.snippet) {
    const marker = lineNo === v.line ? ">" : " ";
    out.push(`  ${marker} ${gutter(lineNo)} | ${source}`);
    if (lineNo === v.line) {
      const pad = " ".repeat(v.column - 1);
      const carets = "^".repeat(TARGET.length);
      out.push(`         | ${pad}${carets}`);
    }
  }
  out.push("");
  out.push("    Fix: prefix the call with `await` (or wrap in `await Promise.all([...])`).");
  out.push("");
  return out.join("\n");
}

function main() {
  const all = [];
  for (const file of walk(SRC)) {
    const raw = readFileSync(file, "utf8");
    for (const v of findUnawaitedCalls(raw)) {
      all.push({ file: relative(ROOT, file), ...v });
    }
  }
  if (all.length) {
    console.error(
      `\n✗ buildBrandPDF must always be awaited. Found ${all.length} un-awaited call site(s):\n`,
    );
    for (const v of all) {
      console.error(renderViolation(v));
    }
    console.error(
      "  buildBrandPDF returns Promise<Blob>. Forgetting `await` ships a Promise into jsPDF/JSZip and silently breaks the Export tab.\n",
    );
    process.exit(1);
  }
  process.exit(0);
}

// Run as CLI only when invoked directly (not when imported by tests).
const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) main();

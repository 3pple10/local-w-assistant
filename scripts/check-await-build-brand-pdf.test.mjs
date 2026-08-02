import { describe, it, expect } from "vitest";
import {
  findUnawaitedCalls,
  sanitize,
} from "./check-await-build-brand-pdf.mjs";

const ok = (src) => expect(findUnawaitedCalls(src)).toEqual([]);
const bad = (src, n = 1) =>
  expect(findUnawaitedCalls(src).length).toBe(n);

describe("findUnawaitedCalls — passing patterns", () => {
  it("direct await", () => {
    ok(`async function f(){ await buildBrandPDF(args); }`);
  });
  it("return await", () => {
    ok(`async function f(){ return await buildBrandPDF(args); }`);
  });
  it("assignment with await", () => {
    ok(`async function f(){ const blob = await buildBrandPDF(args); return blob; }`);
  });
  it("inside await Promise.all single line", () => {
    ok(`async function f(){ await Promise.all([buildBrandPDF(a), other()]); }`);
  });
  it("inside await Promise.allSettled multi-line, multi-call", () => {
    ok(`async function f(){
      await Promise.allSettled([
        buildBrandPDF(a),
        buildBrandPDF(b),
      ]);
    }`);
  });
  it("declaration site", () => {
    ok(`export async function buildBrandPDF(args) { return args; }`);
  });
  it("import statement", () => {
    ok(`import { buildBrandPDF } from "./exports";`);
  });
  it("re-export", () => {
    ok(`export { buildBrandPDF } from "./exports";`);
  });
  it("inside line comment", () => {
    ok(`// buildBrandPDF(args)\nconst x = 1;`);
  });
  it("inside block comment", () => {
    ok(`/* buildBrandPDF(args) */\nconst x = 1;`);
  });
  it("inside template literal", () => {
    ok("const s = `call buildBrandPDF(args) here`;");
  });
  it("inside double-quoted string", () => {
    ok(`const s = "buildBrandPDF(args)";`);
  });
  it("inside single-quoted string", () => {
    ok(`const s = 'buildBrandPDF(args)';`);
  });
});

describe("findUnawaitedCalls — violations", () => {
  it("bare call", () => {
    bad(`function f(){ buildBrandPDF(args); }`);
  });
  it("assigned without await", () => {
    bad(`function f(){ const p = buildBrandPDF(args); }`);
  });
  it("voided without await", () => {
    bad(`function f(){ void buildBrandPDF(args); }`);
  });
  it(".then chain without outer await", () => {
    bad(`function f(){ buildBrandPDF(a).then(x => x); }`);
  });
  it("Promise.all without await prefix", () => {
    bad(`function f(){ Promise.all([buildBrandPDF(a)]); }`);
  });
  it("mixed: one awaited + one bare → exactly 1 violation on correct line", () => {
    const src = [
      "async function f() {",                 // 1
      "  await buildBrandPDF(a);",             // 2 (ok)
      "  buildBrandPDF(b);",                   // 3 (violation)
      "}",                                     // 4
    ].join("\n");
    const v = findUnawaitedCalls(src);
    expect(v.length).toBe(1);
    expect(v[0].line).toBe(3);
  });
});

describe("findUnawaitedCalls — enriched output", () => {
  it("captures the exact call expression", () => {
    const v = findUnawaitedCalls(`function f(){ buildBrandPDF(a, b); }`);
    expect(v[0].expression).toBe("buildBrandPDF(a, b)");
  });
  it("preserves multi-line call expressions verbatim", () => {
    const src = "function f(){\n  buildBrandPDF({\n    name: 'x',\n  });\n}";
    const v = findUnawaitedCalls(src);
    expect(v[0].expression).toBe("buildBrandPDF({\n    name: 'x',\n  })");
  });
  it("truncates very long expressions with ellipsis", () => {
    const big = "x,".repeat(200);
    const v = findUnawaitedCalls(`function f(){ buildBrandPDF(${big}); }`);
    expect(v[0].expression.endsWith("…")).toBe(true);
    expect(v[0].expression.length).toBeLessThanOrEqual(200);
  });
  it("reports 1-indexed column at the identifier", () => {
    const v = findUnawaitedCalls(`function f(){ buildBrandPDF(a); }`);
    // ` buildBrandPDF` starts at column 15
    expect(v[0].column).toBe(15);
  });
  it("includes ±2 lines of context in snippet", () => {
    const src = [
      "// 1",
      "// 2",
      "function f(){",
      "  buildBrandPDF(a);",
      "}",
      "// 6",
    ].join("\n");
    const v = findUnawaitedCalls(src);
    expect(v[0].line).toBe(4);
    expect(v[0].snippet.map((s) => s.lineNo)).toEqual([2, 3, 4, 5, 6]);
    expect(v[0].snippet.find((s) => s.lineNo === 4)?.source).toBe("  buildBrandPDF(a);");
  });
  it("clamps snippet near start of file", () => {
    const v = findUnawaitedCalls("buildBrandPDF(a);\nx;");
    expect(v[0].snippet[0].lineNo).toBe(1);
  });
});

describe("sanitize", () => {
  it("blanks line comments but preserves newlines", () => {
    const out = sanitize("a // comment\nb");
    expect(out.split("\n").length).toBe(2);
    expect(out).not.toContain("comment");
  });
  it("blanks block comments preserving line count", () => {
    const out = sanitize("a /* multi\nline */ b");
    expect(out.split("\n").length).toBe(2);
    expect(out).not.toContain("multi");
  });
  it("blanks all string flavors", () => {
    const out = sanitize(`const a = "x"; const b = 'y'; const c = \`z\`;`);
    expect(out).not.toMatch(/[xyz]/);
  });
});

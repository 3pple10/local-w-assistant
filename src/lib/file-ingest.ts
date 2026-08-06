import JSZip from "jszip";

export type IngestedFile = {
  name: string;
  kind: string;
  bytes: number;
  text: string;
  truncated: boolean;
};

const TEXT_EXT = [
  "txt", "md", "markdown", "csv", "tsv", "json", "jsonl", "yaml", "yml", "toml", "xml",
  "html", "css", "scss", "sql", "py", "js", "jsx", "ts", "tsx", "go", "rs", "java",
  "rb", "php", "c", "h", "cpp", "cs", "swift", "kt", "sh", "env", "ini", "log",
];

const MAX_CHARS = 20000;

function ext(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

/** Minimal XLSX reader: unzips the workbook and flattens sheets to CSV. */
async function readXlsx(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const parser = new DOMParser();

  const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("string");
  const shared: string[] = [];
  if (sharedXml) {
    const doc = parser.parseFromString(sharedXml, "application/xml");
    doc.querySelectorAll("si").forEach((si) => {
      shared.push(Array.from(si.querySelectorAll("t")).map((t) => t.textContent ?? "").join(""));
    });
  }

  const sheetFiles = Object.keys(zip.files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort();

  const out: string[] = [];
  for (const name of sheetFiles) {
    const xml = await zip.file(name)!.async("string");
    const doc = parser.parseFromString(xml, "application/xml");
    const rows: string[] = [];
    doc.querySelectorAll("row").forEach((row) => {
      const cells: string[] = [];
      row.querySelectorAll("c").forEach((c) => {
        const type = c.getAttribute("t");
        const v = c.querySelector("v")?.textContent ?? "";
        if (type === "s") cells.push(shared[Number(v)] ?? "");
        else if (type === "inlineStr")
          cells.push(Array.from(c.querySelectorAll("t")).map((t) => t.textContent ?? "").join(""));
        else cells.push(v);
      });
      rows.push(cells.join(","));
    });
    out.push(`# ${name.replace("xl/worksheets/", "")}\n${rows.join("\n")}`);
  }
  return out.join("\n\n") || "(empty workbook)";
}

export async function ingestFile(file: File): Promise<IngestedFile> {
  const e = ext(file.name);
  let text: string;
  let kind = e || "file";

  if (e === "xlsx" || e === "xlsm") {
    text = await readXlsx(file);
    kind = "excel";
  } else if (TEXT_EXT.includes(e) || file.type.startsWith("text/")) {
    text = await file.text();
  } else {
    text = `(Binary ${file.type || "file"} — cannot be read in the browser. Export it as CSV, JSON or plain text.)`;
    kind = "unsupported";
  }

  const truncated = text.length > MAX_CHARS;
  return {
    name: file.name,
    kind,
    bytes: file.size,
    text: truncated ? `${text.slice(0, MAX_CHARS)}\n…(truncated)` : text,
    truncated,
  };
}

export function filesToPromptBlock(files: IngestedFile[]) {
  if (!files.length) return "";
  return (
    files
      .map((f) => `Attached file: ${f.name} (${f.kind})\n\`\`\`${f.kind}\n${f.text}\n\`\`\``)
      .join("\n\n") + "\n\n"
  );
}

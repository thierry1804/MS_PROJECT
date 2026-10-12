import readXlsxFile from "read-excel-file/browser";
import { parseCsvText, parseImportRows, type ImportResult, type ParseImportOptions } from "./import";

function cellToString(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${d}/${m}/${y}`;
  }
  return String(v).trim();
}

export async function parseImportFile(
  file: File,
  opts: ParseImportOptions,
): Promise<ImportResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const sheets = await readXlsxFile(file);
    const raw = sheets[0]?.data ?? [];
    const rows = raw.map((row: unknown[]) => row.map((cell) => cellToString(cell)));
    return parseImportRows(rows, opts);
  }
  if (name.endsWith(".csv")) {
    const text = await file.text();
    return parseImportRows(parseCsvText(text), opts);
  }
  return {
    tasks: [],
    dependencies: [],
    errors: [{ line: 0, message: "Format non supporté (attendu : .csv ou .xlsx)" }],
  };
}

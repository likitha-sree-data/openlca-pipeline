import Papa from 'papaparse';

export type ParsedSheet = { name: string; headers: string[]; rows: Record<string, string>[] };
export type ParsedFile = { format: 'csv' | 'xlsx'; sheets: ParsedSheet[] };

export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 50_000;

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join('').trim();
    if (o.text !== undefined) return cellText(o.text);
    if (o.result !== undefined) return cellText(o.result);
    if (o.hyperlink) return o.hyperlink;
    return '';
  }
  return String(v).trim();
}

function dedupeHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    const base = h.trim() || `Column ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

export function parseCsv(text: string, name = 'Sheet1'): ParsedSheet {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
  const [head = [], ...body] = res.data;
  const headers = dedupeHeaders(head.map((h) => String(h ?? '')));
  const rows = body.map((r) => Object.fromEntries(headers.map((h, i) => [h, cellText(r[i])])));
  return { name, headers, rows };
}

export async function parseXlsx(buf: ArrayBuffer | Buffer): Promise<ParsedSheet[]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  const sheets: ParsedSheet[] = [];
  for (const ws of wb.worksheets) {
    const grid: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals: string[] = [];
      for (let c = 1; c <= ws.columnCount; c++) vals.push(cellText(row.getCell(c).value));
      grid.push(vals);
    });
    const headerIdx = grid.findIndex((r) => r.filter(Boolean).length >= 2);
    if (headerIdx === -1) { sheets.push({ name: ws.name, headers: [], rows: [] }); continue; }
    const headers = dedupeHeaders(grid[headerIdx]);
    const rows = grid.slice(headerIdx + 1)
      .filter((r) => r.some(Boolean))
      .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
    sheets.push({ name: ws.name, headers, rows });
  }
  return sheets;
}

export async function parseUpload(filename: string, bytes: Buffer): Promise<ParsedFile> {
  if (bytes.length === 0) throw new Error('The file is empty.');
  if (bytes.length > MAX_BYTES) throw new Error('The file is larger than 10 MB.');
  const ext = filename.toLowerCase().split('.').pop();
  let out: ParsedFile;
  if (ext === 'csv') out = { format: 'csv', sheets: [parseCsv(bytes.toString('utf8'))] };
  else if (ext === 'xlsx') out = { format: 'xlsx', sheets: await parseXlsx(bytes) };
  else throw new Error('Upload a .csv or .xlsx file.');
  const rows = out.sheets.reduce((n, s) => n + s.rows.length, 0);
  if (rows > MAX_ROWS) throw new Error(`The file has ${rows} rows. The limit is ${MAX_ROWS}.`);
  if (rows === 0) throw new Error('No data rows found. The first row should hold column names.');
  return out;
}

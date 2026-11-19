/** CSV writer with spreadsheet-formula-injection protection (participant "major" is free text). */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else if (Array.isArray(v)) s = v.join('|');
  else s = String(v);
  if (typeof v === 'string' || Array.isArray(v)) {
    // Neutralise cells that Excel/Sheets would evaluate as formulas.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  }
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const head = columns.map(csvCell).join(',');
  const body = rows.map((r) => columns.map((c) => csvCell(r[c])).join(','));
  // UTF-8 BOM so Excel opens non-ASCII text correctly.
  return '﻿' + [head, ...body].join('\r\n') + '\r\n';
}

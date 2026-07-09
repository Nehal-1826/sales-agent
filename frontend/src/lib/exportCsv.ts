/**
 * Tiny dependency-free CSV export helper used by the admin "Export report"
 * buttons. Client-side only — turns an array of rows + a column spec into a
 * CSV string and triggers a browser download. RFC-4180 quoting; UTF-8 BOM so
 * Excel opens non-ASCII cleanly.
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
}

function escapeCell(raw: unknown): string {
  const s = raw === null || raw === undefined ? '' : String(raw);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => escapeCell(c.header)).join(',');
  const body = rows
    .map((r) => columns.map((c) => escapeCell(c.value(r))).join(','))
    .join('\r\n');
  return body ? `${head}\r\n${body}` : head;
}

export function downloadCsv(filename: string, csv: string): void {
  const name = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Convenience: build + download in one call. Returns the row count exported. */
export function exportRowsToCsv<T>(
  filename: string,
  rows: T[],
  columns: CsvColumn<T>[],
): number {
  downloadCsv(filename, toCsv(rows, columns));
  return rows.length;
}

/** Stable date stamp (YYYY-MM-DD) for export filenames. */
export function exportStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

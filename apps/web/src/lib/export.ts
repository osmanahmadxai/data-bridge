/** Client-side export of result rows to CSV or JSON (no server round-trip). */

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function toCsv(columns: string[], rows: Array<Record<string, unknown>>): string {
  const escape = (s: string) =>
    /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const header = columns.map(escape).join(',');
  const body = rows
    .map((row) => columns.map((c) => escape(cell(row[c]))).join(','))
    .join('\n');
  return `${header}\n${body}`;
}

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportRows(
  columns: string[],
  rows: Array<Record<string, unknown>>,
  format: 'csv' | 'json',
  baseName: string,
): void {
  const safe = baseName.replace(/[^\w.-]+/g, '_') || 'export';
  if (format === 'json') {
    download(`${safe}.json`, JSON.stringify(rows, null, 2), 'application/json');
  } else {
    download(`${safe}.csv`, toCsv(columns, rows), 'text/csv');
  }
}

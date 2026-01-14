export type ParsedCsv = {
  headers: string[];
  rows: string[][];
};

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function parseCsv(raw: string): ParsedCsv {
  const text = normalizeLineEndings(raw.trim());
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (char === '\n') {
      row.push(field);
      field = '';
      if (row.some((value) => value.trim() !== '')) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((value) => value.trim() !== '')) {
    rows.push(row);
  }

  const [headerRow, ...dataRows] = rows;
  const headers = (headerRow ?? []).map((value) => value.trim());

  return {
    headers,
    rows: dataRows,
  };
}

function escapeCsvValue(value: string): string {
  if (/[\",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function stringifyCsv(rows: string[][]): string {
  return rows
    .map((row) => row.map((value) => escapeCsvValue(String(value ?? ''))).join(','))
    .join('\n');
}

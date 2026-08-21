import type { Paginated } from '@/shared/types/api.types';

export async function fetchAllPages<T>(
  fetchPage: (page: number, limit: number) => Promise<Paginated<T>>,
  opts?: { pageSize?: number; maxRows?: number },
): Promise<T[]> {
  const pageSize = opts?.pageSize ?? 100;
  const maxRows = opts?.maxRows ?? 5000;
  const first = await fetchPage(1, pageSize);
  const items = [...(first.items ?? [])];
  const total = Math.min(first.total ?? items.length, maxRows);
  const pages = Math.max(1, Math.ceil(total / pageSize) || 1);
  for (let p = 2; p <= pages && items.length < maxRows; p++) {
    const next = await fetchPage(p, pageSize);
    items.push(...(next.items ?? []));
  }
  return items.slice(0, maxRows);
}

export function csvFilename(name: string) {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${name}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.csv`;
}

function escapeCell(value: string | number | null | undefined) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
) {
  const lines = [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => row.map(escapeCell).join(',')),
  ];
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type PersonLike =
  | string
  | {
      _id?: string;
      name?: string;
      email?: string;
      phone?: string;
      role?: string;
      status?: string;
      businessUserCode?: string;
      externalRef?: string;
    }
  | null
  | undefined;

export function asPerson(value: PersonLike) {
  if (!value) return null;
  if (typeof value === 'string') {
    return {
      _id: value,
      name: '',
      email: '',
      phone: '',
      role: '',
      status: '',
      businessUserCode: '',
      externalRef: '',
    };
  }
  return {
    _id: value._id || '',
    name: value.name || '',
    email: value.email || '',
    phone: value.phone || '',
    role: value.role || '',
    status: value.status || '',
    businessUserCode: value.businessUserCode || '',
    externalRef: value.externalRef || '',
  };
}

export function personCsvCells(value: PersonLike) {
  const p = asPerson(value);
  if (!p) return ['', '', '', ''];
  return [p.name, p.email, p.phone, p.role];
}

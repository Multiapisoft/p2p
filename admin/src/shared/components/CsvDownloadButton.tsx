'use client';

import { useMemo, useState } from 'react';
import { csvFilename, downloadCsv } from '@/shared/lib/csv';
import { downloadPdfTable } from '@/shared/lib/pdf';

export type ExportFilterMap = Record<string, string | number | boolean | null | undefined>;

function activeFilters(filters?: ExportFilterMap) {
  if (!filters) return [];
  return Object.entries(filters)
    .filter(([, v]) => v != null && String(v).trim() !== '' && String(v).toLowerCase() !== 'all')
    .map(([label, value]) => ({ label, value: String(value) }));
}

export function CsvDownloadButton<T>({
  filename,
  columns,
  fetchRows,
  disabled,
  title,
  filters,
}: {
  filename: string;
  columns: { header: string; value: (row: T) => string | number | null | undefined }[];
  fetchRows: () => Promise<T[]>;
  disabled?: boolean;
  title?: string;
  filters?: ExportFilterMap;
}) {
  const [loading, setLoading] = useState<'csv' | 'pdf' | null>(null);
  const [error, setError] = useState('');
  const chips = useMemo(() => activeFilters(filters), [filters]);
  const reportTitle = title || filename.replace(/[-_]/g, ' ');

  const exportRows = async (kind: 'csv' | 'pdf') => {
    setError('');
    setLoading(kind);
    try {
      const rows = await fetchRows();
      const headers = columns.map((c) => c.header);
      const body = rows.map((row) => columns.map((c) => c.value(row)));
      if (kind === 'csv') {
        downloadCsv(csvFilename(filename), headers, body);
      } else {
        await downloadPdfTable({
          filename,
          title: reportTitle,
          headers,
          rows: body,
          filters: chips,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `${kind.toUpperCase()} download failed`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="w-full sm:w-auto">
      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-2 shadow-sm">
        <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">
            Export
          </p>
          <p className="text-[10px] text-on-surface-variant">Current filters</p>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={disabled || !!loading}
            onClick={() => void exportRows('csv')}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm font-semibold text-on-surface transition hover:border-secondary hover:bg-secondary-container/40 disabled:pointer-events-none disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-base text-secondary ${loading === 'csv' ? 'animate-spin' : ''}`}>
              {loading === 'csv' ? 'progress_activity' : 'table'}
            </span>
            CSV
          </button>
          <button
            type="button"
            disabled={disabled || !!loading}
            onClick={() => void exportRows('pdf')}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-on-primary transition hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-base ${loading === 'pdf' ? 'animate-spin' : ''}`}>
              {loading === 'pdf' ? 'progress_activity' : 'picture_as_pdf'}
            </span>
            PDF
          </button>
        </div>
        {chips.length ? (
          <div className="mt-2 flex max-w-[280px] flex-wrap gap-1">
            {chips.map((c) => (
              <span
                key={`${c.label}-${c.value}`}
                className="max-w-full truncate rounded-full bg-secondary-container px-2 py-0.5 text-[10px] font-medium text-on-secondary-container"
                title={`${c.label}: ${c.value}`}
              >
                {c.label}: {c.value}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 px-1 text-[10px] text-on-surface-variant">No extra filters — full list</p>
        )}
      </div>
      {error ? <p className="mt-1 text-xs text-error">{error}</p> : null}
    </div>
  );
}

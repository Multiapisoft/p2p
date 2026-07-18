import { Button } from './Button';

interface PaginationProps {
  page: number;
  totalPages: number;
  total?: number;
  limit?: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, total, limit, onPageChange }: PaginationProps) {
  if (totalPages <= 1 && (!total || total === 0)) return null;

  const from = total && limit ? Math.min((page - 1) * limit + 1, total) : null;
  const to = total && limit ? Math.min(page * limit, total) : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant pt-3 sm:gap-3 sm:pt-4">
      <p className="text-xs text-on-surface-variant sm:text-sm">
        {from != null && to != null && total != null
          ? `Showing ${from}–${to} of ${total}`
          : `Page ${page} of ${Math.max(totalPages, 1)}`}
      </p>
      <div className="flex gap-1.5 sm:gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Prev
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

import { cn } from '@/shared/lib/utils';

const statusStyles: Record<string, string> = {
  pending: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  processing: 'bg-surface-container-high text-on-surface-variant',
  completed: 'bg-secondary-container text-on-secondary-container',
  success: 'bg-secondary-container text-on-secondary-container',
  active: 'bg-secondary-container text-on-secondary-container',
  failed: 'bg-error-container text-on-error-container',
  rejected: 'bg-error-container text-on-error-container',
  cancelled: 'bg-surface-container-high text-on-surface-variant',
  suspended: 'bg-error-container text-on-error-container',
  open: 'bg-secondary-container/30 text-on-secondary-container',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
        statusStyles[status.toLowerCase()] || 'bg-surface-container-high text-on-surface-variant',
      )}
    >
      {status}
    </span>
  );
}

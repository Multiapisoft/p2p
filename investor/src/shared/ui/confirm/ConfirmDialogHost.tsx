'use client';

import { Button } from '@/shared/components/ui/Button';
import { useConfirmStore } from './confirm.store';

export function ConfirmDialogHost() {
  const open = useConfirmStore((s) => s.open);
  const options = useConfirmStore((s) => s.options);
  const close = useConfirmStore((s) => s.close);

  if (!open || !options) return null;

  const variant = options.variant ?? 'primary';

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-on-background/45"
        aria-label="Close"
        onClick={() => close(false)}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="relative z-10 w-full max-w-md rounded-t-2xl border border-outline-variant bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl sm:p-6 sm:pb-6"
      >
        <div className="mb-3 flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              variant === 'danger'
                ? 'bg-error-container text-on-error-container'
                : 'bg-secondary-container/40 text-secondary'
            }`}
          >
            <span className="material-symbols-outlined text-xl">
              {variant === 'danger' ? 'warning' : 'help'}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="confirm-dialog-title"
              className="font-[family-name:var(--font-headline)] text-base font-bold sm:text-lg"
            >
              {options.title}
            </h2>
            {options.description && (
              <p className="mt-1.5 text-sm text-on-surface-variant">{options.description}</p>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => close(false)}>
            {options.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            type="button"
            variant={variant === 'danger' ? 'danger' : variant === 'secondary' ? 'secondary' : 'primary'}
            className="w-full sm:w-auto"
            onClick={() => close(true)}
          >
            {options.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );
}

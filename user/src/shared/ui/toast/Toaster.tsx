'use client';

import { useEffect } from 'react';
import { cn } from '@/shared/lib/utils';
import { useToastStore, type ToastVariant } from './toast.store';

const ICONS: Record<ToastVariant, string> = {
  success: 'check_circle',
  error: 'error',
  info: 'info',
};

const STYLES: Record<ToastVariant, string> = {
  success: 'border-secondary/40 bg-secondary-container/90 text-on-secondary-container',
  error: 'border-error/40 bg-error-container text-on-error-container',
  info: 'border-outline-variant bg-surface-container-lowest text-on-surface',
};

function ToastCard({
  id,
  title,
  description,
  variant,
}: {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}) {
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    const t = setTimeout(() => dismiss(id), 4200);
    return () => clearTimeout(t);
  }, [id, dismiss]);

  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex w-full max-w-sm gap-3 rounded-2xl border px-3.5 py-3 shadow-lg backdrop-blur-sm animate-[slideUp_0.25s_ease-out]',
        STYLES[variant],
      )}
    >
      <span className="material-symbols-outlined shrink-0 text-xl">{ICONS[variant]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {description && <p className="mt-0.5 text-xs opacity-90">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => dismiss(id)}
        className="material-symbols-outlined shrink-0 rounded-lg p-0.5 text-base opacity-70 hover:opacity-100"
        aria-label="Dismiss"
      >
        close
      </button>
    </div>
  );
}

export function Toaster() {
  const items = useToastStore((s) => s.items);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[80] flex flex-col items-center gap-2 px-3 sm:bottom-6 sm:items-end sm:px-6 md:bottom-6">
      {items.map((t) => (
        <ToastCard key={t.id} {...t} />
      ))}
    </div>
  );
}

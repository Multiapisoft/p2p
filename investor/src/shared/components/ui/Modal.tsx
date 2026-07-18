'use client';

import { cn } from '@/shared/lib/utils';
import type { ReactNode } from 'react';
import { useEffect } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, footer, className }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-on-background/50" onClick={onClose} />
      <div
        className={cn(
          'relative z-10 flex max-h-[min(92dvh,920px)] w-full flex-col rounded-t-2xl bg-surface shadow-xl sm:max-w-lg sm:rounded-2xl',
          className,
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-outline-variant/60 px-4 py-3 sm:px-6">
          <h2 className="font-[family-name:var(--font-headline)] text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="material-symbols-outlined rounded-lg p-1 hover:bg-surface-container-high"
          >
            close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          {children}
        </div>

        {footer ? (
          <div className="shrink-0 border-t border-outline-variant/60 bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

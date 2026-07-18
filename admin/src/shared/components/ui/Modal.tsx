'use client';

import { cn } from '@/shared/lib/utils';
import type { ReactNode } from 'react';
import { useEffect } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
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
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-on-background/40" onClick={onClose} />
      <div
        className={cn(
          'custom-scrollbar relative z-10 max-h-[min(92dvh,100%)] w-full overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl sm:p-6 sm:pb-6',
          className,
        )}
      >
        <div className="mb-3 flex items-center justify-between gap-2 sm:mb-4">
          <h2 className="min-w-0 truncate font-[family-name:var(--font-headline)] text-base font-bold sm:text-lg">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="material-symbols-outlined shrink-0 rounded-lg p-1 hover:bg-surface-container-high"
          >
            close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

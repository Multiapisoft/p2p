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
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-on-background/40" onClick={onClose} />
      <div
        className={cn(
          'relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-surface p-6 shadow-xl sm:max-w-lg sm:rounded-2xl',
          className,
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-headline)] text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="material-symbols-outlined rounded-lg p-1 hover:bg-surface-container-high"
          >
            close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

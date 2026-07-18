import { cn } from '@/shared/lib/utils';
import type { TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className, id, ...props }: TextareaProps) {
  const inputId = id || label?.toLowerCase().replace(/\s/g, '-');
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-semibold text-on-surface">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        className={cn(
          'min-h-[100px] w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3 text-on-surface transition-all focus:border-secondary focus:ring-2 focus:ring-secondary/20 focus:outline-none',
          error && 'border-error',
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}

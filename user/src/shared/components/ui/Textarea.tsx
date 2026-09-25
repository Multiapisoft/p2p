import { cn } from '@/shared/lib/utils';
import type { TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function Textarea({ label, className, id, ...props }: TextareaProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-0.5 sm:gap-1">
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold sm:text-sm">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        className={cn(
          'w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-2 text-sm outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 sm:px-3 sm:py-2.5',
          className,
        )}
        rows={3}
        {...props}
      />
    </div>
  );
}

import { cn } from '@/shared/lib/utils';
import type { TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function Textarea({ label, className, id, ...props }: TextareaProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        className={cn(
          'w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-2.5 text-sm outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20',
          className,
        )}
        rows={4}
        {...props}
      />
    </div>
  );
}

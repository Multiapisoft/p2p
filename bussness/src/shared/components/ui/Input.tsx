'use client';

import { cn } from '@/shared/lib/utils';
import { useState, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: string;
  error?: string;
}

export function Input({ label, icon, error, className, id, type, ...props }: InputProps) {
  const [visible, setVisible] = useState(false);
  const inputId = id || label?.toLowerCase().replace(/\s/g, '-');
  const isPassword = type === 'password';
  const inputType = isPassword && visible ? 'text' : type;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-semibold text-on-surface">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xl text-outline">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          type={inputType}
          className={cn(
            'w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-3 text-on-surface transition-all focus:border-secondary focus:ring-2 focus:ring-secondary/20 focus:outline-none',
            icon ? 'pl-10' : 'pl-4',
            isPassword ? 'pr-10' : 'pr-4',
            error && 'border-error',
            className,
          )}
          {...props}
        />
        {isPassword ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={visible ? 'Hide password' : 'Show password'}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-on-surface-variant hover:bg-surface-container-high"
            onClick={() => setVisible((v) => !v)}
          >
            <span className="material-symbols-outlined text-xl">
              {visible ? 'visibility_off' : 'visibility'}
            </span>
          </button>
        ) : null}
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}

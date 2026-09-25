'use client';

import { cn } from '@/shared/lib/utils';
import { useState, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: string;
  /** Right-side currency / unit badge (e.g. USDT, ₹). */
  suffix?: string;
  error?: string;
}

export function Input({ label, icon, suffix, error, className, id, type, ...props }: InputProps) {
  const [visible, setVisible] = useState(false);
  const inputId = id || label?.toLowerCase().replace(/\s/g, '-');
  const isPassword = type === 'password';
  const inputType = isPassword && visible ? 'text' : type;
  const rightPad = isPassword || suffix ? 'pr-11 sm:pr-12' : 'pr-2.5 sm:pr-3';

  return (
    <div className="flex flex-col gap-0.5 sm:gap-1">
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold text-on-surface sm:text-sm">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-lg text-outline sm:left-3 sm:text-xl">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          type={inputType}
          className={cn(
            'w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2 text-sm text-on-surface transition-all focus:border-secondary focus:ring-2 focus:ring-secondary/20 focus:outline-none sm:py-2.5',
            icon ? 'pl-9 sm:pl-10' : 'pl-2.5 sm:pl-3',
            rightPad,
            error && 'border-error',
            className,
          )}
          {...props}
        />
        {suffix && !isPassword ? (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold tracking-wide text-on-surface-variant sm:right-3 sm:text-sm">
            {suffix}
          </span>
        ) : null}
        {isPassword ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={visible ? 'Hide password' : 'Show password'}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-on-surface-variant hover:bg-surface-container-high sm:right-2"
            onClick={() => setVisible((v) => !v)}
          >
            <span className="material-symbols-outlined text-xl">
              {visible ? 'visibility_off' : 'visibility'}
            </span>
          </button>
        ) : null}
      </div>
      {error && <p className="text-[11px] text-error sm:text-xs">{error}</p>}
    </div>
  );
}

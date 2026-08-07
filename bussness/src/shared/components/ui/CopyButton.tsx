'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/shared/components/ui/Button';
import { cn, copyText } from '@/shared/lib/utils';
import type { ButtonHTMLAttributes } from 'react';

type CopyButtonProps = {
  value: string;
  label?: string;
  copiedLabel?: string;
  failedLabel?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Icon-only compact control */
  iconOnly?: boolean;
  resetMs?: number;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children' | 'value'>;

export function CopyButton({
  value,
  label = 'Copy',
  copiedLabel = 'Copied!',
  failedLabel = 'Failed',
  variant = 'secondary',
  size = 'sm',
  className,
  iconOnly = false,
  resetMs = 2000,
  disabled,
  ...rest
}: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const handleCopy = async () => {
    if (!value || disabled) return;
    const ok = await copyText(value);
    setState(ok ? 'copied' : 'failed');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), resetMs);
  };

  const text =
    state === 'copied' ? copiedLabel : state === 'failed' ? failedLabel : label;
  const icon =
    state === 'copied' ? 'check' : state === 'failed' ? 'error' : 'content_copy';

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={() => void handleCopy()}
        disabled={disabled || !value}
        title={text}
        aria-label={text}
        className={cn(
          'inline-flex shrink-0 items-center justify-center gap-1 rounded-lg p-1.5 transition-colors',
          state === 'copied'
            ? 'bg-secondary-container text-on-secondary-container'
            : state === 'failed'
              ? 'bg-error-container text-on-error-container'
              : 'text-secondary hover:bg-surface-container-high',
          className,
        )}
        {...rest}
      >
        <span className="material-symbols-outlined text-xl">{icon}</span>
        {state !== 'idle' ? (
          <span className="pr-1 text-xs font-semibold">{text}</span>
        ) : null}
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant={state === 'copied' ? 'outline' : variant}
      size={size}
      disabled={disabled || !value}
      onClick={() => void handleCopy()}
      className={cn(
        state === 'copied' && 'border-secondary text-secondary',
        state === 'failed' && 'border-error text-error',
        className,
      )}
      {...rest}
    >
      <span className="material-symbols-outlined text-base">{icon}</span>
      {text}
    </Button>
  );
}

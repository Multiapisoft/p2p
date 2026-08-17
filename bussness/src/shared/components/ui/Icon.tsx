'use client';

import { useEffect, useRef, useState } from 'react';
import { cn, copyText } from '@/shared/lib/utils';
import { CopyButton } from '@/shared/components/ui/CopyButton';

export function LoadingScreen() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <span className="material-symbols-outlined animate-spin text-4xl text-secondary">
        progress_activity
      </span>
    </div>
  );
}

export function EmptyState({ message, icon = 'inbox' }: { message: string; icon?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant">
      <span className="material-symbols-outlined mb-3 text-5xl opacity-40">{icon}</span>
      <p className="text-sm">{message}</p>
    </div>
  );
}

export function CopyField({
  label,
  value,
  className,
  compact = false,
}: {
  label: string;
  value: string;
  className?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const handleCopy = async () => {
    if (!value) return;
    const ok = await copyText(value);
    setCopied(ok);
    setFailed(!ok);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCopied(false);
      setFailed(false);
    }, 2000);
  };

  return (
    <div className={cn(compact ? 'space-y-0.5' : 'space-y-1', className)}>
      <p
        className={cn(
          'font-semibold uppercase tracking-wide text-on-surface-variant',
          compact ? 'text-[9px]' : 'text-[10px] sm:text-xs',
        )}
      >
        {label}
      </p>
      <div
        className={cn(
          'flex items-center rounded-lg border bg-surface-container-low transition-colors',
          compact ? 'gap-1 p-1.5' : 'gap-1.5 p-2 sm:gap-2 sm:p-3',
          copied
            ? 'border-secondary'
            : failed
              ? 'border-error'
              : 'border-outline-variant',
        )}
      >
        <code
          className={cn(
            'min-w-0 flex-1 overflow-x-auto break-all',
            compact ? 'text-[10px] leading-snug' : 'text-[11px] sm:text-sm',
          )}
        >
          {value || '—'}
        </code>
        <button
          type="button"
          onClick={() => void handleCopy()}
          disabled={!value}
          className={cn(
            'inline-flex shrink-0 items-center font-semibold transition-colors',
            compact
              ? 'gap-0.5 rounded-md px-1 py-0.5 text-[10px]'
              : 'gap-0.5 rounded-lg px-1.5 py-1 text-[10px] sm:gap-1 sm:px-2 sm:text-xs',
            copied
              ? 'bg-secondary-container text-on-secondary-container'
              : failed
                ? 'bg-error-container text-on-error-container'
                : 'text-secondary hover:bg-surface-container-high',
          )}
          title={copied ? 'Copied!' : failed ? 'Copy failed' : 'Copy'}
          aria-label={copied ? 'Copied' : 'Copy'}
        >
          <span
            className={cn(
              'material-symbols-outlined',
              compact ? 'text-sm' : 'text-base sm:text-lg',
            )}
          >
            {copied ? 'check' : failed ? 'error' : 'content_copy'}
          </span>
          <span className={compact ? 'hidden sm:inline' : undefined}>
            {copied ? 'Copied!' : failed ? 'Failed' : 'Copy'}
          </span>
        </button>
      </div>
    </div>
  );
}

export function SecretBanner({
  secret,
  apiKey,
  internalSecret,
  onDismiss,
}: {
  secret: string;
  apiKey?: string;
  internalSecret?: string;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-xl border-2 border-secondary bg-secondary-container/40 p-4">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-secondary">warning</span>
        <div className="flex-1 space-y-3">
          <p className="text-sm font-bold text-on-secondary-container">
            Copy your secrets now — they will not be shown again!
          </p>
          {apiKey && <CopyField label="API Key" value={apiKey} />}
          {secret && <CopyField label="API Secret" value={secret} />}
          {internalSecret && <CopyField label="Internal Secret" value={internalSecret} />}
          <div className="flex flex-wrap gap-2">
            {apiKey ? <CopyButton value={apiKey} label="Copy API Key" /> : null}
            {secret ? <CopyButton value={secret} label="Copy API Secret" /> : null}
            {internalSecret ? (
              <CopyButton value={internalSecret} label="Copy Internal Secret" />
            ) : null}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-on-secondary hover:opacity-90"
          >
            I have saved my credentials
          </button>
        </div>
      </div>
    </div>
  );
}

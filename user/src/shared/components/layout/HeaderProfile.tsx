'use client';

import { useEffect, useRef, useState } from 'react';

export function HeaderProfile({
  name,
  email,
  roleLabel,
  onLogout,
}: {
  name?: string | null;
  email?: string | null;
  roleLabel?: string | null;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const displayName = (name || email || 'Account').trim();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[12rem] items-center gap-2 rounded-full border border-outline-variant bg-surface-container-lowest py-1 pl-1 pr-2.5 text-left transition-colors hover:bg-surface-container-high sm:max-w-[16rem]"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
          <span className="material-symbols-outlined text-[20px]">person</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold leading-tight text-on-surface sm:text-sm">
            {displayName}
          </span>
        </span>
        <span className="material-symbols-outlined text-base text-on-surface-variant">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-lg"
        >
          <div className="border-b border-outline-variant px-3 py-2.5">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            {email ? (
              <p className="truncate text-xs text-on-surface-variant">{email}</p>
            ) : null}
            {roleLabel ? (
              <p className="mt-0.5 truncate text-[11px] capitalize text-on-surface-variant">
                {roleLabel}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium text-error hover:bg-error-container/30"
          >
            <span className="material-symbols-outlined text-lg">logout</span>
            Logout
          </button>
        </div>
      ) : null}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  MOBILE_MORE_NAV,
  MOBILE_PRIMARY_NAV,
  NAV_ITEMS,
  isNavActive,
} from '@/shared/constants/navigation';
import { cn } from '@/shared/lib/utils';

export function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const moreActive = MOBILE_MORE_NAV.some((item) => isNavActive(pathname, item.to));

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-outline-variant bg-surface/95 px-1 pt-1 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur-md md:hidden"
        style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-stretch justify-around">
          {MOBILE_PRIMARY_NAV.map((item) => {
            const active = isNavActive(pathname, item.to);
            return (
              <Link
                key={item.to}
                href={item.to}
                className={cn(
                  'flex min-w-0 flex-1 flex-col items-center rounded-lg px-0.5 py-1 text-[9px] font-semibold transition-colors sm:text-[10px]',
                  active ? 'text-secondary' : 'text-on-surface-variant',
                )}
              >
                <span
                  className={cn(
                    'material-symbols-outlined text-[20px] sm:text-[22px]',
                    active && 'material-symbols-filled',
                  )}
                >
                  {item.icon}
                </span>
                <span className="mt-0.5 max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              'flex min-w-0 flex-1 flex-col items-center rounded-lg px-0.5 py-1 text-[9px] font-semibold sm:text-[10px]',
              moreActive || moreOpen ? 'text-secondary' : 'text-on-surface-variant',
            )}
          >
            <span className="material-symbols-outlined text-[20px] sm:text-[22px]">more_horiz</span>
            <span className="mt-0.5">More</span>
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl border-t border-outline-variant bg-surface p-4 pb-8 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-[family-name:var(--font-headline)] text-lg font-bold">More</p>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="material-symbols-outlined rounded-lg p-2 hover:bg-surface-container-high"
              >
                close
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {MOBILE_MORE_NAV.map((item) => {
                const active = isNavActive(pathname, item.to);
                return (
                  <Link
                    key={item.to}
                    href={item.to}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium',
                      active
                        ? 'border-secondary bg-secondary-container/30 text-on-secondary-container'
                        : 'border-outline-variant hover:bg-surface-container-low',
                    )}
                  >
                    <span className="material-symbols-outlined">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function getPageTitle(pathname: string) {
  return NAV_ITEMS.find((n) => isNavActive(pathname, n.to))?.label ?? 'Business';
}

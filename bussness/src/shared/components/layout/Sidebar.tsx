'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS, isNavActive } from '@/shared/constants/navigation';
import { cn } from '@/shared/lib/utils';

interface SidebarProps {
  userEmail?: string;
  onLogout: () => void;
}

export function Sidebar({ userEmail, onLogout }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col border-r border-outline-variant bg-surface md:flex">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-outline-variant px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-on-primary">
          <span className="material-symbols-outlined text-xl">storefront</span>
        </div>
        <div className="min-w-0">
          <h1 className="truncate font-[family-name:var(--font-headline)] text-base font-bold">
            PaySecure247
          </h1>
          <p className="text-[11px] text-on-surface-variant">Business Portal</p>
        </div>
      </div>

      <nav className="custom-scrollbar flex-1 space-y-0.5 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(pathname, item.to);
          return (
            <Link
              key={item.to}
              href={item.to}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-secondary-container text-on-secondary-container'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
              )}
            >
              <span
                className={cn(
                  'material-symbols-outlined text-[22px]',
                  active && 'material-symbols-filled',
                )}
              >
                {item.icon}
              </span>
              <div className="min-w-0">
                <p className="truncate">{item.label}</p>
                {item.description && (
                  <p className="truncate text-[10px] font-normal opacity-70">{item.description}</p>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-outline-variant p-4">
        <p className="truncate text-sm font-medium text-on-surface">{userEmail}</p>
        <p className="text-xs text-on-surface-variant">Business account</p>
        <button
          type="button"
          onClick={onLogout}
          className="mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-error transition-colors hover:bg-error-container/30"
        >
          <span className="material-symbols-outlined text-lg">logout</span>
          Logout
        </button>
      </div>
    </aside>
  );
}

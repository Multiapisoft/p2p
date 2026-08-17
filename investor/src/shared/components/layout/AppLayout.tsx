'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { NAV_ITEMS } from '@/shared/constants/navigation';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { cn } from '@/shared/lib/utils';
import { useState, type ReactNode } from 'react';

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  const mobilePrimary = NAV_ITEMS.slice(0, 4);
  const mobileMore = NAV_ITEMS.slice(4);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="hidden h-dvh w-64 shrink-0 flex-col overflow-hidden border-r border-outline-variant bg-surface md:flex">
        <div className="flex shrink-0 items-center gap-3 border-b border-outline-variant px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white">
            <span className="material-symbols-outlined text-xl">savings</span>
          </div>
          <div>
            <h1 className="font-[family-name:var(--font-headline)] text-lg font-bold">InvesPro</h1>
            <p className="text-xs text-on-surface-variant">Investor Panel</p>
          </div>
        </div>
        <nav className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto p-4">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
            return (
              <Link
                key={item.to}
                href={item.to}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-secondary-container text-on-secondary-container'
                    : 'text-on-surface-variant hover:bg-surface-container-high',
                )}
              >
                <span className={cn('material-symbols-outlined text-xl', active && 'material-symbols-filled')}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="shrink-0 border-t border-outline-variant p-4">
          <p className="truncate text-sm font-medium">{user?.email}</p>
          <p className="text-xs capitalize text-on-surface-variant">Investor</p>
          <button
            onClick={handleLogout}
            className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-error hover:bg-error-container/30"
          >
            <span className="material-symbols-outlined text-lg">logout</span>
            Logout
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="z-40 flex shrink-0 items-center justify-between border-b border-outline-variant bg-surface px-4 py-3">
          <div className="flex items-center gap-2 md:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white">
              <span className="material-symbols-outlined text-lg">savings</span>
            </div>
            <span className="font-[family-name:var(--font-headline)] text-lg font-bold">InvesPro</span>
          </div>
          <div className="hidden text-sm text-on-surface-variant md:block">
            {NAV_ITEMS.find((n) => pathname === n.to || pathname.startsWith(`${n.to}/`))?.label ??
              'Investor'}
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <button
              onClick={handleLogout}
              className="material-symbols-outlined rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high md:hidden"
            >
              logout
            </button>
          </div>
        </header>

        <main className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-6 pb-24 md:px-8 md:pb-8">
          {children}
        </main>

        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-outline-variant bg-surface px-2 py-2 shadow-md md:hidden">
          <div className="flex justify-around">
            {mobilePrimary.map((item) => {
              const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
              return (
                <Link
                  key={item.to}
                  href={item.to}
                  className={cn(
                    'flex flex-col items-center rounded-xl px-2 py-1 text-[10px] transition-transform active:scale-95',
                    active ? 'text-secondary' : 'text-on-surface-variant',
                  )}
                >
                  <span className={cn('material-symbols-outlined text-xl', active && 'material-symbols-filled')}>
                    {item.icon}
                  </span>
                  <span className="mt-0.5 font-medium">{item.label}</span>
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex flex-col items-center rounded-xl px-2 py-1 text-[10px] text-on-surface-variant"
            >
              <span className="material-symbols-outlined text-xl">more_horiz</span>
              <span className="mt-0.5 font-medium">More</span>
            </button>
          </div>
          {mobileMenuOpen && (
            <div className="mt-2 grid grid-cols-4 gap-2 border-t border-outline-variant pt-2">
              {mobileMore.map((item) => (
                <Link
                  key={item.to}
                  href={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex flex-col items-center rounded-lg p-2 text-[10px] hover:bg-surface-container-high"
                >
                  <span className="material-symbols-outlined">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </nav>
      </div>
    </div>
  );
}

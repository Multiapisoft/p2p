'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { NAV_ITEMS } from '@/shared/constants/navigation';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { cn } from '@/shared/lib/utils';
import { useState, type ReactNode } from 'react';
import { toast } from '@/shared/ui/toast/toast.store';
import { confirmDialog } from '@/shared/ui/confirm/confirm.store';

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    const ok = await confirmDialog({
      title: 'Log out?',
      description: 'You will need to sign in again to access your wallet.',
      confirmLabel: 'Log out',
      cancelLabel: 'Stay signed in',
      variant: 'danger',
    });
    if (!ok) return;
    logout();
    toast.info('Logged out');
    router.replace('/login');
  };

  const mobilePrimary = NAV_ITEMS.slice(0, 4);
  const mobileMore = NAV_ITEMS.slice(4);

  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:border-r md:border-outline-variant md:bg-surface">
        <div className="flex items-center gap-3 border-b border-outline-variant px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white">
            <span className="material-symbols-outlined text-xl">account_balance_wallet</span>
          </div>
          <div>
            <h1 className="font-[family-name:var(--font-headline)] text-lg font-bold">FinGuard</h1>
            <p className="text-xs text-on-surface-variant">User Wallet</p>
          </div>
        </div>
        <nav className="custom-scrollbar flex-1 space-y-1 overflow-y-auto p-4">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.to || (item.to !== '/' && pathname.startsWith(item.to));
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
        <div className="border-t border-outline-variant p-4">
          <p className="truncate text-sm font-medium">{user?.email}</p>
          <p className="text-xs capitalize text-on-surface-variant">{user?.role}</p>
          <button
            onClick={handleLogout}
            className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-error hover:bg-error-container/30"
          >
            <span className="material-symbols-outlined text-lg">logout</span>
            Logout
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-outline-variant bg-surface/95 px-3 py-2.5 backdrop-blur-sm sm:px-4 sm:py-3">
          <div className="flex min-w-0 items-center gap-2 md:hidden">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-white">
              <span className="material-symbols-outlined text-base">account_balance_wallet</span>
            </div>
            <span className="truncate font-[family-name:var(--font-headline)] text-base font-bold">
              FinGuard
            </span>
          </div>
          <div className="hidden text-sm text-on-surface-variant md:block">
            {NAV_ITEMS.find((n) => pathname === n.to || (n.to !== '/' && pathname.startsWith(n.to)))?.label ?? 'Wallet'}
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <NotificationBell />
            <button
              onClick={handleLogout}
              className="material-symbols-outlined rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-high md:hidden sm:p-2"
            >
              logout
            </button>
          </div>
        </header>

        <main className="custom-scrollbar flex-1 overflow-x-hidden overflow-y-auto px-3 py-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:px-4 sm:py-5 md:px-8 md:pb-8 md:py-6">
          {children}
        </main>

        <nav
          className="fixed bottom-0 left-0 right-0 z-50 border-t border-outline-variant bg-surface/95 px-1 pt-1.5 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm md:hidden"
          style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex justify-around">
            {mobilePrimary.map((item) => {
              const active = pathname === item.to || (item.to !== '/' && pathname.startsWith(item.to));
              return (
                <Link
                  key={item.to}
                  href={item.to}
                  className={cn(
                    'flex min-w-0 flex-1 flex-col items-center rounded-lg px-1 py-1 text-[9px] transition-transform active:scale-95 sm:text-[10px]',
                    active ? 'text-secondary' : 'text-on-surface-variant',
                  )}
                >
                  <span className={cn('material-symbols-outlined text-xl', active && 'material-symbols-filled')}>
                    {item.icon}
                  </span>
                  <span className="mt-0.5 max-w-full truncate font-medium">{item.label}</span>
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={cn(
                'flex min-w-0 flex-1 flex-col items-center rounded-lg px-1 py-1 text-[9px] sm:text-[10px]',
                mobileMenuOpen ? 'text-secondary' : 'text-on-surface-variant',
              )}
            >
              <span className="material-symbols-outlined text-xl">more_horiz</span>
              <span className="mt-0.5 font-medium">More</span>
            </button>
          </div>
          {mobileMenuOpen && (
            <div className="mt-1.5 grid grid-cols-3 gap-1 border-t border-outline-variant pt-1.5">
              {mobileMore.map((item) => (
                <Link
                  key={item.to}
                  href={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex flex-col items-center rounded-lg p-2 text-[10px] hover:bg-surface-container-high active:bg-surface-container-high"
                >
                  <span className="material-symbols-outlined text-lg">{item.icon}</span>
                  <span className="mt-0.5 font-medium">{item.label}</span>
                </Link>
              ))}
            </div>
          )}
        </nav>
      </div>
    </div>
  );
}

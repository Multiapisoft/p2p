'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { NAV_ITEMS } from '@/shared/constants/navigation';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { HeaderProfile } from '@/shared/components/layout/HeaderProfile';
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
      <aside className="hidden md:flex md:w-56 md:shrink-0 md:flex-col md:border-r md:border-outline-variant md:bg-surface lg:w-60">
        <div className="flex items-center gap-2.5 border-b border-outline-variant px-4 py-3.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white">
            <span className="material-symbols-outlined text-lg">account_balance_wallet</span>
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-[family-name:var(--font-headline)] text-base font-bold">
              FairPlay
            </h1>
            <p className="text-[11px] text-on-surface-variant">User Wallet</p>
          </div>
        </div>
        <nav className="custom-scrollbar flex-1 space-y-0.5 overflow-y-auto p-2.5">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
            return (
              <Link
                key={item.to}
                href={item.to}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-secondary-container text-on-secondary-container'
                    : 'text-on-surface-variant hover:bg-surface-container-high',
                )}
              >
                <span
                  className={cn(
                    'material-symbols-outlined text-xl',
                    active && 'material-symbols-filled',
                  )}
                >
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-12 items-center justify-between border-b border-outline-variant bg-surface/95 px-2.5 backdrop-blur-sm sm:px-4">
          <div className="flex min-w-0 items-center gap-2 md:hidden">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-white">
              <span className="material-symbols-outlined text-base">account_balance_wallet</span>
            </div>
            <span className="truncate font-[family-name:var(--font-headline)] text-sm font-bold sm:text-base">
              FairPlay
            </span>
          </div>
          <div className="hidden text-sm text-on-surface-variant md:block">
            {NAV_ITEMS.find((n) => pathname === n.to || pathname.startsWith(`${n.to}/`))?.label ??
              'Wallet'}
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
            <NotificationBell />
            <HeaderProfile
              name={user?.name}
              email={user?.email}
              roleLabel={user?.role}
              onLogout={handleLogout}
            />
          </div>
        </header>

        <main className="custom-scrollbar flex-1 overflow-x-hidden overflow-y-auto px-2.5 py-3 pb-[calc(4.25rem+env(safe-area-inset-bottom))] sm:px-4 sm:py-4 md:px-6 md:pb-6 md:py-5">
          {children}
        </main>

        <nav
          className="fixed bottom-0 left-0 right-0 z-50 border-t border-outline-variant bg-surface/95 px-0.5 pt-1 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm md:hidden"
          style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex justify-around">
            {mobilePrimary.map((item) => {
              const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
              return (
                <Link
                  key={item.to}
                  href={item.to}
                  className={cn(
                    'flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center rounded-lg px-0.5 py-1 text-[9px] transition-transform active:scale-95 sm:text-[10px]',
                    active ? 'text-secondary' : 'text-on-surface-variant',
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
                  <span className="mt-0.5 max-w-full truncate font-medium leading-none">
                    {item.label}
                  </span>
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={cn(
                'flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center rounded-lg px-0.5 py-1 text-[9px] sm:text-[10px]',
                mobileMenuOpen ? 'text-secondary' : 'text-on-surface-variant',
              )}
            >
              <span className="material-symbols-outlined text-[22px]">more_horiz</span>
              <span className="mt-0.5 font-medium leading-none">More</span>
            </button>
          </div>
          {mobileMenuOpen && (
            <div className="mt-1 grid grid-cols-4 gap-1 border-t border-outline-variant px-1 pt-1.5 pb-1">
              {mobileMore.map((item) => (
                <Link
                  key={item.to}
                  href={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex min-h-14 flex-col items-center justify-center rounded-lg p-1.5 text-[10px] hover:bg-surface-container-high active:bg-surface-container-high"
                >
                  <span className="material-symbols-outlined text-lg">{item.icon}</span>
                  <span className="mt-0.5 text-center font-medium leading-tight">{item.label}</span>
                </Link>
              ))}
            </div>
          )}
        </nav>
      </div>
    </div>
  );
}

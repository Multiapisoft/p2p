'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/shared/components/layout/Sidebar';
import { MobileNav, getPageTitle } from '@/shared/components/layout/MobileNav';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { useAuthStore } from '@/features/auth/store/auth.store';
import type { ReactNode } from 'react';

export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar userEmail={user?.email} onLogout={handleLogout} />

      <div className="flex min-h-screen flex-col md:pl-64">
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-outline-variant bg-surface/95 px-4 backdrop-blur-md md:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-on-primary md:hidden">
              <span className="material-symbols-outlined text-lg">storefront</span>
            </div>
            <span className="font-[family-name:var(--font-headline)] text-lg font-bold md:text-xl">
              {getPageTitle(pathname)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button
              type="button"
              onClick={handleLogout}
              className="material-symbols-outlined rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high md:hidden"
              aria-label="Logout"
            >
              logout
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 pb-24 md:px-8 md:pb-8">{children}</main>
      </div>

      <MobileNav />
    </div>
  );
}

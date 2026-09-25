'use client';

import { useEffect, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { AccountSettingsPanel } from '../components/AccountSettingsPanel';
import { PlatformRulesPanel } from '../components/PlatformRulesPanel';
import { SubAdminsPanel } from '../components/SubAdminsPanel';

type TabId = 'account' | 'platform' | 'sub-admins';

const TAB_META: {
  id: TabId;
  label: string;
  icon: string;
  description: string;
}[] = [
  {
    id: 'account',
    label: 'Account',
    icon: 'person',
    description: 'Profile and two-factor authentication',
  },
  {
    id: 'platform',
    label: 'Platform',
    icon: 'tune',
    description: 'Timing, methods, settlement, referrals',
  },
  {
    id: 'sub-admins',
    label: 'Sub-admins',
    icon: 'admin_panel_settings',
    description: 'Staff access, login-as, businesses',
  },
];

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const canManagePlatform =
    user?.role === 'admin' ||
    !!user?.permissions?.includes(PERMISSIONS.PLATFORM_SETTINGS);
  const isAdmin = user?.role === 'admin';

  const visibleTabs = useMemo(
    () =>
      TAB_META.filter((t) => {
        if (t.id === 'platform') return canManagePlatform;
        if (t.id === 'sub-admins') return isAdmin;
        return true;
      }),
    [canManagePlatform, isAdmin],
  );

  const requested = (searchParams.get('tab') || 'account') as TabId;
  const activeTab: TabId = visibleTabs.some((t) => t.id === requested)
    ? requested
    : (visibleTabs[0]?.id ?? 'account');

  useEffect(() => {
    if (requested === activeTab) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', activeTab);
    router.replace(`${pathname}?${params.toString()}`);
  }, [activeTab, pathname, requested, router, searchParams]);

  function setTab(id: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', id);
    router.replace(`${pathname}?${params.toString()}`);
  }

  const activeMeta = TAB_META.find((t) => t.id === activeTab);

  return (
    <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-headline)] text-xl font-bold sm:text-2xl">
          Settings
        </h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          {activeMeta?.description || 'Manage your admin workspace'}
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex gap-1 overflow-x-auto rounded-2xl border border-outline-variant bg-surface-container-low/50 p-1"
      >
        {visibleTabs.map((t) => {
          const on = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.id)}
              className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition sm:px-4 ${
                on
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-lowest hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[18px] sm:text-[20px]">
                {t.icon}
              </span>
              <span className="truncate">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {activeTab === 'account' ? <AccountSettingsPanel /> : null}
        {activeTab === 'platform' && canManagePlatform ? <PlatformRulesPanel /> : null}
        {activeTab === 'sub-admins' && isAdmin ? <SubAdminsPanel /> : null}
      </div>
    </div>
  );
}

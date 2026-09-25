'use client';

import { Card } from '@/shared/components/ui/Card';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { TwoFactorPanel } from './TwoFactorPanel';

export function AccountSettingsPanel() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card title="Profile">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-outline-variant/70 bg-surface-container-low/40 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
              Email
            </p>
            <p className="mt-1 break-all text-sm font-medium sm:text-base">{user?.email || '—'}</p>
          </div>
          <div className="rounded-xl border border-outline-variant/70 bg-surface-container-low/40 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
              Role
            </p>
            <p className="mt-1 text-sm font-medium capitalize sm:text-base">
              {user?.role?.replace('_', ' ') || '—'}
            </p>
          </div>
          {user?.name ? (
            <div className="rounded-xl border border-outline-variant/70 bg-surface-container-low/40 px-4 py-3 sm:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
                Name
              </p>
              <p className="mt-1 text-sm font-medium sm:text-base">{user.name}</p>
            </div>
          ) : null}
        </div>
        <p className="mt-4 text-xs text-on-surface-variant">
          Signed in to the admin panel. Use 2FA below to secure this account.
        </p>
      </Card>

      <TwoFactorPanel />
    </div>
  );
}

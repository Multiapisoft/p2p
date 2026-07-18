'use client';

import { useState } from 'react';
import { cn } from '@/shared/lib/utils';

const TABS = [
  { id: 'credentials', label: 'Keys', icon: 'key' },
  { id: 'partner', label: 'Third Party', icon: 'language' },
  { id: 'tools', label: 'User Tools', icon: 'account_balance_wallet' },
  { id: 'docs', label: 'API Docs', icon: 'description' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function IntegrationTabs({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (tab: TabId) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-low p-1">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            'flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors',
            active === tab.id
              ? 'bg-surface text-on-surface shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface',
          )}
        >
          <span className="material-symbols-outlined text-lg">{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export type { TabId };

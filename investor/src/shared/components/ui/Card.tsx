import { cn } from '@/shared/lib/utils';
import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
}

export function Card({ children, className, title, action }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-outline-variant bg-surface-container-lowest card-shadow',
        className,
      )}
    >
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3 md:px-6">
          {title && (
            <h3 className="font-[family-name:var(--font-headline)] text-lg font-semibold text-on-surface">
              {title}
            </h3>
          )}
          {action}
        </div>
      )}
      <div className="p-4 md:p-6">{children}</div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  trend?: string;
  variant?: 'default' | 'warning' | 'success';
}

export function StatCard({ label, value, icon, trend, variant = 'default' }: StatCardProps) {
  const iconColors = {
    default: 'text-secondary bg-secondary-container/20',
    warning: 'text-error bg-error-container/20',
    success: 'text-on-secondary-container bg-secondary-container/30',
  };

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 card-shadow">
      <div className="mb-2 flex items-start justify-between">
        <span className="text-sm font-semibold uppercase tracking-wide text-on-surface-variant">
          {label}
        </span>
        <span
          className={cn(
            'material-symbols-outlined rounded-full p-2 text-xl',
            iconColors[variant],
          )}
        >
          {icon}
        </span>
      </div>
      <p className="font-[family-name:var(--font-headline)] text-3xl font-bold text-on-surface">
        {value}
      </p>
      {trend && (
        <p className="mt-2 flex items-center gap-1 text-sm text-secondary">
          <span className="material-symbols-outlined text-sm">trending_up</span>
          {trend}
        </p>
      )}
    </div>
  );
}

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
        <div className="flex items-center justify-between gap-2 border-b border-outline-variant px-3 py-2 sm:px-4 sm:py-2.5">
          {title && (
            <h3 className="font-[family-name:var(--font-headline)] text-sm font-semibold text-on-surface sm:text-base">
              {title}
            </h3>
          )}
          {action}
        </div>
      )}
      <div className="p-3 sm:p-4">{children}</div>
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
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-2.5 card-shadow sm:p-3.5">
      <div className="mb-1 flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant sm:text-xs">
          {label}
        </span>
        <span
          className={cn(
            'material-symbols-outlined rounded-full p-1 text-base sm:p-1.5 sm:text-lg',
            iconColors[variant],
          )}
        >
          {icon}
        </span>
      </div>
      <p className="break-all font-[family-name:var(--font-headline)] text-lg font-bold leading-tight text-on-surface sm:text-2xl">
        {value}
      </p>
      {trend && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-secondary sm:text-xs">
          <span className="material-symbols-outlined text-sm">trending_up</span>
          {trend}
        </p>
      )}
    </div>
  );
}

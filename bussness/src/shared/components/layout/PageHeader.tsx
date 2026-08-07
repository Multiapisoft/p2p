import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-[family-name:var(--font-headline)] text-xl font-bold tracking-tight sm:text-2xl md:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-0.5 text-xs text-on-surface-variant sm:mt-1 sm:text-sm md:text-base">
            {description}
          </p>
        )}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

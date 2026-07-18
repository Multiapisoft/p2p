import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-[family-name:var(--font-headline)] text-2xl font-bold tracking-tight md:text-3xl">
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-on-surface-variant md:text-base">{description}</p>}
      </div>
      {action}
    </div>
  );
}

'use client';

import { cn } from '@/shared/lib/utils';

type Chip = { value: string; label: string };

export function PermissionChips({
  options,
  selected,
  onChange,
  className,
}: {
  options: readonly Chip[];
  selected: string[];
  onChange: (next: string[]) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {options.map(({ value, label }) => {
        const on = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition sm:text-sm',
              on
                ? 'border-secondary bg-secondary-container text-on-secondary-container'
                : 'border-outline-variant text-on-surface hover:bg-surface-container-low',
            )}
            onClick={() =>
              onChange(on ? selected.filter((x) => x !== value) : [...selected, value])
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

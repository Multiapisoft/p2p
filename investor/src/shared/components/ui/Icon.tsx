import { cn } from '@/shared/lib/utils';

export function Icon({ name, filled, className }: { name: string; filled?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'material-symbols-outlined',
        filled && 'material-symbols-filled',
        className,
      )}
    >
      {name}
    </span>
  );
}

export function LoadingScreen() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <span className="material-symbols-outlined animate-spin text-4xl text-secondary">
        progress_activity
      </span>
    </div>
  );
}

export function EmptyState({ message, icon = 'inbox' }: { message: string; icon?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant">
      <span className="material-symbols-outlined mb-3 text-5xl opacity-40">{icon}</span>
      <p className="text-sm">{message}</p>
    </div>
  );
}

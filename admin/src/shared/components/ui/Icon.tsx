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
    <div className="flex min-h-[30vh] items-center justify-center sm:min-h-[50vh]">
      <span className="material-symbols-outlined animate-spin text-3xl text-secondary sm:text-4xl">
        progress_activity
      </span>
    </div>
  );
}

export function EmptyState({ message, icon = 'inbox' }: { message: string; icon?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-on-surface-variant sm:py-16">
      <span className="material-symbols-outlined mb-2 text-4xl opacity-40 sm:mb-3 sm:text-5xl">{icon}</span>
      <p className="px-2 text-center text-sm">{message}</p>
    </div>
  );
}

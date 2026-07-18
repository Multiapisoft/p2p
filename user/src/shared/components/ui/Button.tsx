import { cn } from '@/shared/lib/utils';
import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  loading,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const variants = {
    primary: 'bg-primary text-on-primary hover:opacity-90',
    secondary: 'bg-secondary text-on-secondary hover:opacity-90',
    outline: 'border border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low',
    ghost: 'hover:bg-surface-container-high text-on-surface-variant',
    danger: 'bg-error text-on-error hover:opacity-90',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-sm font-semibold',
    lg: 'px-6 py-3.5 text-base font-semibold',
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
      )}
      {children}
    </button>
  );
}

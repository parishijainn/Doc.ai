import type { ReactNode } from 'react';
import { cn } from './cn';

type Variant = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export function Badge({
  children,
  variant = 'neutral',
  className,
}: {
  children: ReactNode;
  variant?: Variant;
  className?: string;
}) {
  const variants: Record<Variant, string> = {
    neutral: 'bg-slate-100 text-slate-800 border-slate-200',
    success: 'bg-green-100 text-green-900 border-green-200',
    warning: 'bg-yellow-100 text-yellow-900 border-yellow-200',
    danger: 'bg-red-100 text-red-900 border-red-200',
    info: 'bg-indigo-50 text-indigo-900 border-indigo-200',
  };
  return (
    <span className={cn('inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold', variants[variant], className)}>
      {children}
    </span>
  );
}


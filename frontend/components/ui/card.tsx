import type { ReactNode } from 'react';
import { cn } from './cn';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn('rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow', className)}>
      {children}
    </section>
  );
}

export function CardHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-5 pb-3', className)}>{children}</div>;
}

export function CardContent({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-5 pt-3', className)}>{children}</div>;
}


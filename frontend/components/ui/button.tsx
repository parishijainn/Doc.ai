'use client';

import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Size = 'lg' | 'md' | 'sm';

export function Button({
  className,
  variant = 'primary',
  size = 'lg',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition focus:outline-none focus:ring-4 disabled:opacity-50 disabled:cursor-not-allowed';
  const sizes: Record<Size, string> = {
    lg: 'px-6 py-4 text-base min-h-[52px]',
    md: 'px-5 py-3 text-sm min-h-[44px]',
    sm: 'px-4 py-2 text-sm min-h-[38px]',
  };
  const variants: Record<Variant, string> = {
    primary: 'bg-teal-600 text-white hover:bg-teal-700 focus:ring-teal-200',
    secondary: 'bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 focus:ring-slate-200',
    ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 focus:ring-slate-200',
    destructive: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-200',
  };

  return <button className={cn(base, sizes[size], variants[variant], className)} {...props} />;
}


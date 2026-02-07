'use client';

import type { ReactNode } from 'react';
import { cn } from './cn';

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn('w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-xl', className)}
        onClick={(e) => e.stopPropagation()}
      >
        {(title ?? footer) ? (
          <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-3">
            <div>
              {title ? <div className="text-lg font-extrabold tracking-tight text-slate-900">{title}</div> : null}
            </div>
            <button
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        ) : null}
        <div className="p-5">{children}</div>
        {footer ? <div className="p-5 border-t border-slate-200">{footer}</div> : null}
      </div>
    </div>
  );
}


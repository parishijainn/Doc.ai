import type { ReactNode } from 'react';
import { AppHeader } from './AppHeader';

export function PageShell({
  children,
  variant = 'default',
}: {
  children: ReactNode;
  variant?: 'default' | 'wide';
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <AppHeader />
      <main className={variant === 'wide' ? 'max-w-6xl mx-auto px-4 py-6' : 'max-w-3xl mx-auto px-4 py-8'}>
        {children}
      </main>
      <footer className="border-t border-slate-200/80 mt-10">
        <div className="max-w-6xl mx-auto px-4 py-6 text-sm text-slate-600">
          <p>
            CareZoom is a hackathon prototype. It is <span className="font-semibold">not a doctor</span> and cannot diagnose.
            If you have an emergency, call your local emergency number.
          </p>
        </div>
      </footer>
    </div>
  );
}


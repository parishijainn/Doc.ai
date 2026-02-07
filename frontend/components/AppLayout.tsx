import type { ReactNode } from 'react';
import { AppHeader } from './AppHeader';

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <AppHeader />
      {children}
      <footer className="border-t border-slate-200/80 mt-10">
        <div className="max-w-6xl mx-auto px-4 py-6 text-sm text-slate-600">
          CliniView / CareZoom is a hackathon prototype and is <span className="font-semibold">not a doctor</span>.
          For emergencies, call your local emergency number.
        </div>
      </footer>
    </div>
  );
}


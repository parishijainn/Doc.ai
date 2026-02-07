'use client';

import type { ReactNode } from 'react';
import { cn } from './cn';

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ id: string; label: string; content: ReactNode }>;
  value: string;
  onChange: (id: string) => void;
}) {
  const active = tabs.find((t) => t.id === value) ?? tabs[0];

  return (
    <div>
      <div className="flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm max-w-full">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-semibold transition whitespace-nowrap',
              t.id === active.id ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-4">{active?.content}</div>
    </div>
  );
}


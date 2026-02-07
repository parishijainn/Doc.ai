import Link from 'next/link';
import { MapPinned, Pill, Stethoscope, Users } from 'lucide-react';

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
    >
      {label}
    </Link>
  );
}

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-sky-500 shadow-sm" />
          <div className="leading-tight">
            <div className="font-extrabold text-slate-900 tracking-tight">CliniView</div>
            <div className="text-xs text-slate-600">Senior telehealth + care map</div>
          </div>
        </Link>

        <nav className="flex items-center gap-1">
          <Link
            href="/"
            className="hidden sm:inline-flex rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
          >
            Home
          </Link>
          <Link
            href="/visit"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
          >
            <Stethoscope className="w-4 h-4" />
            Start/Join
          </Link>
          <Link
            href="/care-map"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
          >
            <MapPinned className="w-4 h-4" />
            Care Map
          </Link>
          <Link
            href="/meds"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
          >
            <Pill className="w-4 h-4" />
            Med scanner
          </Link>
          <Link
            href="/visit/invite"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
          >
            <Users className="w-4 h-4" />
            Invite
          </Link>
        </nav>
      </div>
    </header>
  );
}


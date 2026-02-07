'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function InviteCaregiverPage() {
  const search = useSearchParams();
  const visitId = (search.get('visitId') ?? '').trim();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const visitLink = useMemo(() => {
    if (!mounted) return '';
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim() || (typeof window !== 'undefined' ? window.location.origin : '');
    if (!base) return '';
    if (!visitId) return `${base}/consent`;
    return `${base}/visit/${encodeURIComponent(visitId)}`;
  }, [mounted, visitId]);

  const handleCopyLink = () => {
    if (!visitLink) return;
    navigator.clipboard.writeText(visitLink);
    setSent(true);
  };

  return (
    <main className="min-h-screen p-6 bg-slate-50 flex flex-col items-center justify-center">
      <div className="max-w-xl w-full space-y-6">
        <h1 className="text-senior-2xl font-bold text-slate-900 text-center">
          Invite a caregiver
        </h1>
        <p className="text-senior-lg text-slate-700">
          Share a link so a family member or caregiver can join your visit. They can open the link on their phone or computer.
        </p>
        {!visitId ? (
          <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4 text-senior text-yellow-900">
            Tip: open this page with <code>?visitId=YOUR_VISIT_ID</code> to share a link to a specific visit.
          </div>
        ) : null}
        <div className="bg-white border-2 border-slate-200 rounded-xl p-4 break-all text-senior">
          {visitLink}
        </div>
        <button onClick={handleCopyLink} className="senior-btn w-full">
          {sent ? 'Link copied!' : 'Copy link'}
        </button>
        <p className="text-senior text-slate-600">
          You can also send this link by email or text yourself and share it with your caregiver.
        </p>
        <Link href="/" className="senior-btn-secondary inline-flex justify-center w-full">
          Back to home
        </Link>
      </div>
    </main>
  );
}

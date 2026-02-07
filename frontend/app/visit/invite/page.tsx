'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function InviteCaregiverPage() {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState(false);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const visitLink = `${baseUrl}/consent`;

  const handleCopyLink = () => {
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

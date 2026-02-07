'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const CONSENT_TEXT = `This tool is not a doctor. It offers information and triage support only. It cannot diagnose you or provide definitive treatment.

• We will not diagnose you. We may suggest possible causes and next steps.
• For medications, we only give general guidance. Always check with your pharmacist or doctor and your allergy/medication list.
• If you describe an emergency (e.g., chest pain, difficulty breathing, stroke symptoms), we will advise you to call 911 or your local emergency number and will not give other advice.
• Your information is kept private and used only to support your visit. We use short retention and ask your consent before sharing with anyone.`;

export default function ConsentPage() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    if (!agreed) return;
    setLoading(true);
    try {
      const api =
        (process.env.NEXT_PUBLIC_API_URL ?? '').trim() ||
        'http://localhost:4000';
      const res = await fetch(`${api}/api/visit/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.conversation_id) {
        router.push(`/visit/${data.conversation_id}`);
      } else {
        alert('Could not start visit. Please try again.');
      }
    } catch (e) {
      alert('Connection error. Is the server running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-6 bg-slate-50 flex flex-col items-center justify-center">
      <div className="max-w-2xl w-full space-y-6">
        <h1 className="text-senior-2xl font-bold text-slate-900 text-center">
          Before we start
        </h1>
        <div className="bg-white border-2 border-slate-200 rounded-xl p-6 text-senior text-slate-700 whitespace-pre-line">
          {CONSENT_TEXT}
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="w-8 h-8 mt-1 rounded border-2 border-slate-400"
          />
          <span className="text-senior-lg">I understand. This is not a doctor, and I want to continue.</span>
        </label>
        <div className="flex justify-center pt-4">
          <button
            onClick={handleStart}
            disabled={!agreed || loading}
            className="senior-btn"
          >
            {loading ? 'Starting…' : 'Continue to visit'}
          </button>
        </div>
      </div>
    </main>
  );
}

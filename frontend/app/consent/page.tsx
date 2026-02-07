'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';

const CONSENT_TEXT = `This tool is not a doctor. It offers information and triage support only. It cannot diagnose you or provide definitive treatment.

• We will not diagnose you. We may suggest possible causes and next steps.
• For medications, we only give general guidance. Always check with your pharmacist or doctor and your allergy/medication list.
• If you describe an emergency (e.g., chest pain, difficulty breathing, stroke symptoms), we will advise you to call 911 or your local emergency number and will not give other advice.
• Your information is kept private and used only to support your visit. We use short retention and ask your consent before sharing with anyone.`;

export default function ConsentPage() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    if (!agreed) return;
    setLoading(true);
    setError(null);
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
      if (!res.ok) {
        setError(data?.error ?? data?.details ?? 'Could not start visit. Please try again.');
        return;
      }
      if (data.conversation_id) {
        router.push(`/visit/${data.conversation_id}`);
      } else {
        setError('Could not start visit. Please try again.');
      }
    } catch (e) {
      setError('Connection error. Is the server running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">Consent</h1>
          <p className="text-sm text-slate-600 mt-2">A quick safety & privacy summary before starting.</p>
        </div>
        <Badge variant="neutral">Step 1 of 3</Badge>
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <div className="text-lg font-extrabold tracking-tight text-slate-900">Before we start</div>
            <div className="text-sm text-slate-600 mt-1">This takes about 15 seconds.</div>
          </CardHeader>
          <CardContent>
            <div className="whitespace-pre-line text-slate-700 leading-relaxed">{CONSENT_TEXT}</div>

            <label className="mt-6 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="w-6 h-6 mt-1 rounded border-2 border-slate-400"
              />
              <div>
                <div className="font-semibold text-slate-900">I understand and want to continue</div>
                <div className="text-sm text-slate-600">You can stop at any time and contact a clinician for medical advice.</div>
              </div>
            </label>

            {error ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div>
            ) : null}

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Button onClick={handleStart} disabled={!agreed || loading} className="w-full sm:w-auto">
                {loading ? 'Starting…' : 'Continue to meeting'}
              </Button>
              <Link href="/visit" className="w-full sm:w-auto">
                <Button variant="secondary" className="w-full">
                  Start/Join options
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

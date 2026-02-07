'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';

const API =
  (process.env.NEXT_PUBLIC_API_URL ?? '').trim() ||
  'http://localhost:4000';

export default function SummaryPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    fetch(`${API}/api/visit/${sessionId}/summary`)
      .then((res) => res.json())
      .then((data) => setSummary(data.summary ?? {}))
      .catch(() => setSummary({ sessionId, note: 'Summary could not be loaded.' }));
  }, [sessionId]);

  const handlePrint = () => window.print();

  return (
    <main className="min-h-screen p-6 bg-slate-50 max-w-2xl mx-auto">
      <h1 className="text-senior-2xl font-bold text-slate-900 mb-6">Visit summary</h1>
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-senior print:border-none print:shadow-none">
        {summary ? (
          <>
            <p><strong>Visit:</strong> {sessionId}</p>
            <p className="mt-3"><strong>So to summarize…</strong> {String((summary as any).whatIHeard ?? '')}</p>
            <p className="mt-3"><strong>Most likely causes:</strong></p>
            <ul className="list-disc pl-6">
              {Array.isArray((summary as any).likelyPossibilities) ? (summary as any).likelyPossibilities.map((x: string, i: number) => <li key={i}>{x}</li>) : null}
            </ul>
            <p className="mt-3"><strong>What you can do now:</strong></p>
            <ul className="list-disc pl-6">
              {Array.isArray((summary as any).whatToDoNow) ? (summary as any).whatToDoNow.map((x: string, i: number) => <li key={i}>{x}</li>) : null}
            </ul>
            <p className="mt-3"><strong>Warning signs:</strong></p>
            <ul className="list-disc pl-6">
              {Array.isArray((summary as any).warningSigns) ? (summary as any).warningSigns.map((x: string, i: number) => <li key={i}>{x}</li>) : null}
            </ul>
            <p className="mt-3"><strong>Who to see:</strong> {String((summary as any).whoToSee ?? '')}</p>
            <p className="mt-1"><strong>Timeline:</strong> {String((summary as any).timeline ?? '')}</p>
            <p className="mt-4 text-slate-600">{String((summary as any).disclaimer ?? '')}</p>
            {summary.note && <p className="mt-4 text-slate-600">{String(summary.note)}</p>}
          </>
        ) : (
          <p>Loading summary…</p>
        )}
      </div>
      <p className="mt-6 text-senior text-slate-600">
        This is not a medical record. Share it with your clinician if helpful. Always follow up with a real doctor or nurse when needed.
      </p>
      <div className="mt-8 flex flex-wrap gap-4">
        <button onClick={handlePrint} className="senior-btn">
          Print summary
        </button>
        <Link href="/" className="senior-btn-secondary inline-flex items-center justify-center">
          Back to home
        </Link>
      </div>
    </main>
  );
}

'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import { Badge } from '../../../../components/ui/badge';
import { Skeleton } from '../../../../components/ui/skeleton';
import { Calendar, MapPinned, Camera, Users } from 'lucide-react';

const API =
  (process.env.NEXT_PUBLIC_API_URL ?? '').trim() ||
  'http://localhost:4000';

export default function SummaryPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    fetch(`${API}/api/visit/${sessionId}/summary`)
      .then((res) => res.json())
      .then((data) => {
        setSummary(data.summary ?? {});
        setLoadedAt(new Date().toISOString());
      })
      .catch(() => setSummary({ sessionId, note: 'Summary could not be loaded.' }));
  }, [sessionId]);

  const handlePrint = () => window.print();

  const what = String((summary as any)?.whatIHeard ?? '');
  const likely = Array.isArray((summary as any)?.likelyPossibilities) ? ((summary as any).likelyPossibilities as string[]) : [];
  const now = Array.isArray((summary as any)?.whatToDoNow) ? ((summary as any).whatToDoNow as string[]) : [];
  const warn = Array.isArray((summary as any)?.warningSigns) ? ((summary as any).warningSigns as string[]) : [];
  const who = String((summary as any)?.whoToSee ?? '');
  const timeline = String((summary as any)?.timeline ?? '');
  const disclaimer = String((summary as any)?.disclaimer ?? '');

  const takeaways = [now[0], now[1], warn[0]].filter(Boolean).slice(0, 3) as string[];

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900">Visit summary</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <Badge variant="neutral">Visit ID: <span className="font-mono">{sessionId}</span></Badge>
            <span className="inline-flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {loadedAt ? new Date(loadedAt).toLocaleString() : 'Loading…'}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={handlePrint}>Print</Button>
          <Link href={`/visit/${sessionId}/care-map`}><Button variant="secondary"><MapPinned className="w-4 h-4" />Care Map</Button></Link>
          <Link href={`/visit/${sessionId}/photo`}><Button variant="secondary"><Camera className="w-4 h-4" />Photos</Button></Link>
        </div>
      </header>

      {!summary ? (
        <div className="grid gap-4">
          <Skeleton className="h-28" />
          <div className="grid md:grid-cols-2 gap-4">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="text-sm font-semibold text-slate-700">Summary</div>
              <div className="text-2xl font-extrabold tracking-tight text-slate-900">Key takeaways</div>
            </CardHeader>
            <CardContent>
              {takeaways.length ? (
                <ul className="list-disc pl-6 text-slate-800">
                  {takeaways.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              ) : (
                <div className="text-slate-700">{what || 'Summary not available yet.'}</div>
              )}
            </CardContent>
          </Card>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <div className="text-sm font-semibold text-slate-700">Key details</div>
                <div className="text-xl font-extrabold tracking-tight text-slate-900">What you shared</div>
              </CardHeader>
              <CardContent>
                <div className="text-slate-800">{what || '—'}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="text-sm font-semibold text-slate-700">Possibilities</div>
                <div className="text-xl font-extrabold tracking-tight text-slate-900">Most likely possibilities</div>
              </CardHeader>
              <CardContent>
                {likely.length ? (
                  <ul className="list-disc pl-6 text-slate-800">
                    {likely.map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                ) : (
                  <div className="text-slate-700">—</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="text-sm font-semibold text-slate-700">Next steps</div>
                <div className="text-xl font-extrabold tracking-tight text-slate-900">What to do now</div>
              </CardHeader>
              <CardContent>
                {now.length ? (
                  <ul className="list-disc pl-6 text-slate-800">
                    {now.map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                ) : (
                  <div className="text-slate-700">—</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="text-sm font-semibold text-slate-700">Safety</div>
                <div className="text-xl font-extrabold tracking-tight text-slate-900">Warning signs</div>
              </CardHeader>
              <CardContent>
                {warn.length ? (
                  <ul className="list-disc pl-6 text-slate-800">
                    {warn.map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                ) : (
                  <div className="text-slate-700">—</div>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="text-sm font-semibold text-slate-700">Follow‑up</div>
                <div className="text-xl font-extrabold tracking-tight text-slate-900">Who to see & timeframe</div>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4 text-slate-800">
                  <div><span className="font-semibold">Who to see:</span> {who || '—'}</div>
                  <div><span className="font-semibold">Timeline:</span> {timeline || '—'}</div>
                </div>
                {disclaimer ? <div className="mt-4 text-sm text-slate-600">{disclaimer}</div> : null}
              </CardContent>
            </Card>
          </div>

          <div className="sticky bottom-4">
            <div className="rounded-2xl border border-slate-200 bg-white/90 backdrop-blur p-3 shadow-sm flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="text-sm text-slate-600">
                Next: explore care options, upload photos, or invite a caregiver.
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Link href={`/visit/${sessionId}/care-map`}><Button><MapPinned className="w-4 h-4" />View care map</Button></Link>
                <Link href={`/visit/${sessionId}/photo`}><Button variant="secondary"><Camera className="w-4 h-4" />Upload photos</Button></Link>
                <Link href={`/visit/invite?visitId=${encodeURIComponent(sessionId)}`}><Button variant="secondary"><Users className="w-4 h-4" />Invite caregiver</Button></Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

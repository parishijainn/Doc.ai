'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader } from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import { Skeleton } from '../../../../components/ui/skeleton';
import { useEffect, useState } from 'react';

export default function VisitCareMapPage() {
  const params = useParams();
  const visitId = params.id as string;
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setLoaded(true), 400);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Care map</h1>
          <p className="text-sm text-slate-600 mt-1">
            Visit: <span className="font-mono">{visitId}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/visit/${visitId}/summary`}><Button variant="secondary">Back to summary</Button></Link>
          <Link href={`/visit/${visitId}/photo`}><Button variant="secondary">Photos</Button></Link>
        </div>
      </header>

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="text-sm text-slate-600">Embedded care map (same as standalone, prefilled with this visit)</div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="relative">
            {!loaded ? (
              <div className="w-full h-[78vh]">
                <Skeleton className="w-full h-full" />
              </div>
            ) : null}
            <iframe
              title="Care Map"
              src={`/care-map?visitId=${encodeURIComponent(visitId)}`}
              className="w-full h-[78vh] rounded-2xl"
              style={{ opacity: loaded ? 1 : 0, transition: 'opacity 200ms ease' }}
              onLoad={() => setLoaded(true)}
            />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}


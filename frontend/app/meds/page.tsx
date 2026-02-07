'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { OtcMedicationScanner } from '../../components/otc/OtcMedicationScanner';

const API = (process.env.NEXT_PUBLIC_API_URL ?? '').trim() || 'http://localhost:4000';

export default function MedsPage() {
  const search = useSearchParams();
  const initialVisitId = (search.get('visitId') ?? '').trim();
  const [visitId, setVisitId] = useState(initialVisitId);

  const effectiveVisitId = useMemo(() => visitId.trim(), [visitId]);

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900">Medication scanner</h1>
          <p className="text-slate-600 mt-2">Scan an OTC label from the live camera feed and generate a safe, label-based plan.</p>
        </div>
        <Badge variant="neutral">Camera + OCR</Badge>
      </div>

      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="text-sm text-amber-900">
          <span className="font-semibold">Safety:</span> This is label-based guidance only and not a substitute for a clinician. If emergency symptoms, call emergency services.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="text-sm font-semibold text-slate-700">Optional: attach to a visit</div>
          <div className="text-sm text-slate-600">
            If you paste a Visit ID, the generated plan will be stored with that visit (so the visit summary includes it).
          </div>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base"
            placeholder="Visit ID (e.g. c123...)"
            value={visitId}
            onChange={(e) => setVisitId(e.target.value)}
          />
          <Link href={effectiveVisitId ? `/visit/${encodeURIComponent(effectiveVisitId)}` : '#'} className="w-full sm:w-auto">
            <Button variant="secondary" className="w-full" disabled={!effectiveVisitId}>
              Open visit
            </Button>
          </Link>
        </CardContent>
      </Card>

      <OtcMedicationScanner apiBaseUrl={API} conversationId={effectiveVisitId || undefined} />

      <div className="text-xs text-slate-600">
        Tip: after you copy the “note for doctor”, you can paste it into the meeting chat/agent prompt if you’re already in a call.
      </div>
    </main>
  );
}


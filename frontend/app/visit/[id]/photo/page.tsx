'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import { Badge } from '../../../../components/ui/badge';
import { Skeleton } from '../../../../components/ui/skeleton';
import { Camera, MapPinned, FileText } from 'lucide-react';

const API = (process.env.NEXT_PUBLIC_API_URL ?? '').trim() || 'http://localhost:4000';

export default function VisitPhotoPage() {
  const params = useParams();
  const visitId = params.id as string;

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append('image', file);
      const res = await fetch(`${API}/api/visit/${visitId}/image`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Upload failed');
      setResult(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const imageType = String(result?.analysis?.imageType ?? '');
  const observations = Array.isArray(result?.analysis?.observations) ? (result.analysis.observations as string[]) : [];

  const nextSteps = useMemo(
    () => [
      'If symptoms are worsening, seek care sooner.',
      'If this is a medication label, confirm details with your pharmacist and bring the bottle to your visit.',
      'If this is a wound, keep it clean and watch for spreading redness, warmth, pus, or increasing pain.',
    ],
    []
  );

  const urgent = useMemo(
    () => [
      'Trouble breathing, chest pain/pressure, or fainting',
      'Rapidly spreading redness, severe swelling, or severe pain',
      'Fever with worsening symptoms or new confusion',
      'Uncontrolled bleeding or signs of severe allergic reaction',
    ],
    []
  );

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Photos</h1>
          <p className="text-sm text-slate-600 mt-1">
            Visit: <span className="font-mono">{visitId}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/visit/${visitId}/summary`}><Button variant="secondary"><FileText className="w-4 h-4" />Summary</Button></Link>
          <Link href={`/visit/${visitId}/care-map`}><Button variant="secondary"><MapPinned className="w-4 h-4" />Care map</Button></Link>
        </div>
      </header>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="text-lg font-extrabold tracking-tight text-slate-900">Step 1 — Upload</div>
            <div className="text-sm text-slate-600 mt-1">Rash, injury, medication label, or exercise form.</div>
          </CardHeader>
          <CardContent>
            <div
              className={[
                'rounded-2xl border border-dashed p-6 text-center transition',
                dragOver ? 'border-teal-400 bg-teal-50' : 'border-slate-300 bg-slate-50',
              ].join(' ')}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) {
                  setFile(f);
                  upload(f);
                }
              }}
            >
              <Camera className="w-6 h-6 mx-auto text-slate-600" />
              <div className="mt-2 font-semibold text-slate-900">Drag & drop an image</div>
              <div className="text-sm text-slate-600 mt-1">or choose a file</div>
              <div className="mt-4">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setFile(f);
                      upload(f);
                    }
                    e.currentTarget.value = '';
                  }}
                  className="block w-full text-sm"
                />
              </div>
            </div>

            {busy ? <div className="mt-3 text-sm text-slate-600">Uploading…</div> : null}
            {error ? <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="text-lg font-extrabold tracking-tight text-slate-900">Step 2 — Preview</div>
            <div className="text-sm text-slate-600 mt-1">This is used for non‑diagnostic observations.</div>
          </CardHeader>
          <CardContent>
            {previewUrl ? (
              <img src={previewUrl} alt="Preview" className="w-full rounded-2xl border border-slate-200 object-contain max-h-[380px] bg-white" />
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-sm text-slate-600 text-center">
                No photo selected yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="text-lg font-extrabold tracking-tight text-slate-900">Step 3 — Results</div>
          <div className="text-sm text-slate-600 mt-1">We provide observations and next steps, not diagnosis.</div>
        </CardHeader>
        <CardContent>
          {!result && busy ? (
            <div className="grid md:grid-cols-3 gap-4">
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
            </div>
          ) : null}

          {result ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info">Type: {imageType || '—'}</Badge>
                {result?.tavus_prompt ? <Badge variant="neutral">Can be shared into meeting</Badge> : null}
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-sm font-semibold text-slate-700">What I see (non‑diagnostic)</div>
                  <ul className="mt-2 list-disc pl-6 text-slate-800">
                    {observations.length ? observations.map((x, i) => <li key={i}>{x}</li>) : <li>—</li>}
                  </ul>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-sm font-semibold text-slate-700">What to do next</div>
                  <ul className="mt-2 list-disc pl-6 text-slate-800">
                    {nextSteps.map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-sm font-semibold text-slate-700">When to seek urgent care</div>
                  <ul className="mt-2 list-disc pl-6 text-slate-800">
                    {urgent.map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-600">Upload a photo to see results.</div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}


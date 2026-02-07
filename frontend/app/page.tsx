import Link from 'next/link';
import { JoinMeetingBox } from '../components/JoinMeetingBox';
import { ArrowRight, MapPinned, Stethoscope, FileText, Camera } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Button } from '../components/ui/button';

export default function HomePage() {
  return (
    <main className="max-w-7xl mx-auto px-6 py-12 space-y-12">
      {/* Hero */}
      <section className="grid lg:grid-cols-2 gap-8 items-center">
        <div className="space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-900">
            <span>Hackathon demo</span>
            <span className="text-indigo-700">•</span>
            <span>OpenStreetMap + Tavus</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-slate-900">
            Doc.ai
          </h1>
          <p className="text-lg md:text-xl text-slate-700">
            Modern AI‑powered telehealth triage + care navigation in minutes.
          </p>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Not for emergencies. This tool is <span className="font-semibold">not a doctor</span> and cannot diagnose.
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/consent">
              <Button>
                Start a visit <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/visit">
              <Button variant="secondary">
                Join a visit
              </Button>
            </Link>
          </div>
        </div>

        <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white border-slate-700/40">
          <CardHeader>
            <div className="text-sm text-slate-200">How it works</div>
            <div className="text-2xl font-extrabold tracking-tight">Start → Talk → Summary → Care map</div>
          </CardHeader>
          <CardContent className="text-sm text-slate-200 space-y-3">
            <div className="flex items-start gap-3">
              <Stethoscope className="w-5 h-5 mt-0.5" />
              <div>
                <div className="font-semibold text-white">Start</div>
                <div>One click after consent.</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 mt-0.5" />
              <div>
                <div className="font-semibold text-white">Talk</div>
                <div>Captions + utterance capture.</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Camera className="w-5 h-5 mt-0.5" />
              <div>
                <div className="font-semibold text-white">Upload</div>
                <div>Photos for non‑diagnostic observations.</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPinned className="w-5 h-5 mt-0.5" />
              <div>
                <div className="font-semibold text-white">Find care</div>
                <div>Nearby facilities + routing + capacity demo.</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Join box */}
      <section>
        <Card>
          <CardHeader>
            <div className="text-xl font-extrabold tracking-tight text-slate-900">Join an existing visit</div>
            <div className="text-sm text-slate-600">Paste a visit ID if a caregiver shared a link.</div>
          </CardHeader>
          <CardContent>
            <JoinMeetingBox />
          </CardContent>
        </Card>
      </section>

      {/* Features */}
      <section className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: 'Clinician avatar', desc: 'Tavus / Daily room experience.' },
          { title: 'Visit summary', desc: 'Structured next steps + warnings.' },
          { title: 'Care map', desc: 'OSM-only nearby search + routing.' },
          { title: 'Photo upload', desc: 'Non-diagnostic observations.' },
        ].map((f) => (
          <Card key={f.title}>
            <CardContent>
              <div className="font-extrabold text-slate-900">{f.title}</div>
              <div className="mt-1 text-sm text-slate-600">{f.desc}</div>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}

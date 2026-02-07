import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50">
      <div className="max-w-xl w-full text-center space-y-8">
        <h1 className="text-senior-2xl font-bold text-slate-900">
          CareZoom
        </h1>
        <p className="text-senior-lg text-slate-700">
          Your health visit, simplified. Get triage guidance and find care near you—all in one place.
        </p>
        <p className="text-senior text-slate-600">
          This tool is not a doctor. It offers information and triage support. When in doubt, see a clinician.
        </p>
        <div className="pt-6 flex flex-col gap-4 items-center">
          <Link
            href="/consent"
            className="senior-btn inline-flex items-center justify-center"
          >
            Start Visit
          </Link>
          <Link
            href="/visit/invite"
            className="senior-btn-secondary inline-flex items-center justify-center"
          >
            Invite a caregiver
          </Link>
        </div>
      </div>
    </main>
  );
}

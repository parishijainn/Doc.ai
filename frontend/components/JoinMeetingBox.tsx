'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

export function JoinMeetingBox() {
  const [meetingId, setMeetingId] = useState('');

  const joinHref = useMemo(() => {
    const id = meetingId.trim();
    return id ? `/visit/${encodeURIComponent(id)}` : '';
  }, [meetingId]);

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-800">Join an existing meeting</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] items-center">
        <input
          className="senior-input max-w-none !text-base !p-3"
          placeholder="Paste meeting ID (conversation ID)"
          value={meetingId}
          onChange={(e) => setMeetingId(e.target.value)}
        />
        <Link
          href={joinHref || '#'}
          className={`senior-btn-secondary inline-flex items-center justify-center !min-w-0 px-5 py-3 text-base ${
            joinHref ? '' : 'pointer-events-none opacity-50'
          }`}
        >
          Join
        </Link>
      </div>
      <div className="mt-2 text-xs text-slate-600">
        Tip: if a caregiver shares a link like <span className="font-mono">/visit/&lt;id&gt;</span>, copy the id here.
      </div>
    </div>
  );
}


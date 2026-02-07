'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const API = (process.env.NEXT_PUBLIC_API_URL ?? '').trim() || 'http://127.0.0.1:4000';

export default function MockMeetingPage() {
  const search = useSearchParams();
  const sessionId = (search.get('sessionId') ?? '').trim();
  const reason = (search.get('reason') ?? '').trim();
  const [role, setRole] = useState<'user' | 'replica'>('user');
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const canSend = useMemo(() => Boolean(sessionId && text.trim()), [sessionId, text]);

  const send = async () => {
    if (!canSend) return;
    const payload = { speaker: role, text: text.trim() };
    setNote('Sending…');
    try {
      const res = await fetch(`${API}/api/visit/${encodeURIComponent(sessionId)}/utterance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));

      // Also notify parent (visit page) so it can show captions/notes instantly (best-effort).
      try {
        window.parent?.postMessage(
          {
            type: 'utterance',
            role,
            text: payload.text,
          },
          '*'
        );
      } catch {}

      setText('');
      setNote('Sent.');
      setTimeout(() => setNote(null), 1200);
    } catch (e) {
      setNote(`Failed to send: ${String(e)}`);
    }
  };

  const banner =
    reason === 'forcedMock'
      ? 'Demo mode is forced. Add “utterances” here so summaries still work.'
      : reason === 'missingTavusConfig'
        ? 'Tavus isn’t configured, so you’re in the local demo room. Add “utterances” here so summaries still work.'
        : 'This is the local demo room. Add “utterances” here so summaries still work.';

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div>
          <div className="text-2xl font-semibold tracking-tight text-slate-900">Mock meeting</div>
          <div className="text-sm text-slate-600 mt-1">
            Session: <span className="font-mono">{sessionId || '—'}</span>
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{banner}</div>

        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-2 items-center">
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-4 focus:ring-indigo-100"
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
          >
            <option value="user">User</option>
            <option value="replica">Agent</option>
          </select>
          <input
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-4 focus:ring-indigo-100"
            placeholder="Type an utterance…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send();
            }}
          />
        </div>

        <button
          className="inline-flex items-center justify-center rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 transition-all duration-150 disabled:opacity-50"
          onClick={send}
          disabled={!canSend}
        >
          Send
        </button>

        {note ? <div className="text-sm text-slate-600">{note}</div> : null}
      </div>
    </main>
  );
}


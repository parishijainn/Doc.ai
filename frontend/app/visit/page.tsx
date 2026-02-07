'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Tabs } from '../../components/ui/tabs';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { JoinMeetingBox } from '../../components/JoinMeetingBox';
import { Badge } from '../../components/ui/badge';

function extractConversationId(input: string): string {
  const raw = input.trim();
  if (!raw) return '';
  // If user pastes a full URL like https://domain/visit/<id> or /visit/<id>, extract it.
  try {
    const url = raw.startsWith('http') ? new URL(raw) : null;
    const path = url ? url.pathname : raw;
    const m = path.match(/\/visit\/([^/?#]+)/);
    if (m?.[1]) return decodeURIComponent(m[1]);
  } catch {
    // ignore
  }
  // Otherwise assume it's already the id.
  return raw;
}

export default function StartJoinPage() {
  const [tab, setTab] = useState<'start' | 'join'>('start');
  const [joinInput, setJoinInput] = useState('');

  const joinId = useMemo(() => extractConversationId(joinInput), [joinInput]);
  const joinHref = joinId ? `/visit/${encodeURIComponent(joinId)}` : '';

  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">Start or join a visit</h1>
          <p className="text-sm text-slate-600 mt-2">A simple flow for video triage and care navigation.</p>
        </div>
        <Badge variant="info">Hackathon demo</Badge>
      </div>

      <div className="mt-6">
        <Tabs
          value={tab}
          onChange={(id) => setTab(id as any)}
          tabs={[
            {
              id: 'start',
              label: 'Start a new visit',
              content: (
                <Card>
                  <CardHeader>
                    <div className="text-lg font-extrabold tracking-tight text-slate-900">New visit</div>
                    <div className="text-sm text-slate-600 mt-1">You’ll review consent and then join the meeting.</div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Link href="/consent" className="w-full sm:w-auto">
                        <Button className="w-full">Continue to consent</Button>
                      </Link>
                      <Link href="/" className="w-full sm:w-auto">
                        <Button variant="secondary" className="w-full">
                          Back home
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ),
            },
            {
              id: 'join',
              label: 'Join existing',
              content: (
                <Card>
                  <CardHeader>
                    <div className="text-lg font-extrabold tracking-tight text-slate-900">Join a visit</div>
                    <div className="text-sm text-slate-600 mt-1">
                      Paste a caregiver link or just the visit ID.
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-sm font-semibold text-slate-800">Paste link or ID</div>
                        <input
                          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base focus:outline-none focus:ring-4 focus:ring-slate-200"
                          placeholder="e.g. https://yourapp.com/visit/abc123 or abc123"
                          value={joinInput}
                          onChange={(e) => setJoinInput(e.target.value)}
                        />
                        <div className="mt-3 flex flex-col sm:flex-row gap-3">
                          <Link href={joinHref || '#'} className={joinHref ? '' : 'pointer-events-none opacity-50'}>
                            <Button>Join visit</Button>
                          </Link>
                          <Button variant="secondary" onClick={() => setJoinInput('')}>
                            Clear
                          </Button>
                        </div>
                      </div>

                      {/* Keep existing JoinMeetingBox behavior as fallback */}
                      <div className="opacity-90">
                        <JoinMeetingBox />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ),
            },
          ]}
        />
      </div>
    </main>
  );
}


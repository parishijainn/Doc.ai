'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Mail, MessageSquare, Copy } from 'lucide-react';

export default function InviteCaregiverPage() {
  const search = useSearchParams();
  const visitId = (search.get('visitId') ?? '').trim();
  const [sent, setSent] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const baseUrl = useMemo(() => {
    if (!mounted) return '';
    return (process.env.NEXT_PUBLIC_APP_URL ?? '').trim() || (typeof window !== 'undefined' ? window.location.origin : '');
  }, [mounted]);

  const visitLink = useMemo(() => {
    if (!mounted) return '';
    const base = baseUrl;
    if (!base) return '';
    if (!visitId) return `${base}/consent`;
    return `${base}/visit/${encodeURIComponent(visitId)}`;
  }, [mounted, visitId, baseUrl]);

  const localhostWarning = useMemo(() => {
    const b = baseUrl.toLowerCase();
    return b.includes('localhost') || b.includes('127.0.0.1');
  }, [baseUrl]);

  const handleCopyLink = () => {
    if (!visitLink) return;
    navigator.clipboard.writeText(visitLink);
    setSent(true);
  };

  const smsHref = useMemo(() => {
    if (!visitLink) return '';
    const body = `Join my CliniView visit: ${visitLink}`;
    return `sms:&body=${encodeURIComponent(body)}`;
  }, [visitLink]);

  const emailHref = useMemo(() => {
    if (!visitLink) return '';
    const subject = 'Join my CliniView visit';
    const body = `Here’s the link to join my visit:\n\n${visitLink}\n\nIf you can’t open it, let me know.`;
    return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [visitLink]);

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">Invite a caregiver</h1>
          <p className="text-sm text-slate-600 mt-2">Share a link so family can join from any device.</p>
        </div>
        <Badge variant="info">Share link</Badge>
      </div>

      {!visitId ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent>
            <div className="font-semibold text-amber-900">Tip</div>
            <div className="mt-1 text-sm text-amber-900">
              Open this page with <code className="font-mono">?visitId=YOUR_VISIT_ID</code> to generate a link to a specific meeting.
            </div>
          </CardContent>
        </Card>
      ) : null}

      {localhostWarning ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent>
            <div className="font-semibold text-amber-900">Heads up</div>
            <div className="mt-1 text-sm text-amber-900">
              Your share link uses <span className="font-mono">{baseUrl || 'localhost'}</span>. Caregivers outside your computer won’t be able to open it.
              Set <code className="font-mono">NEXT_PUBLIC_APP_URL</code> to your ngrok or deployed URL.
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="text-lg font-extrabold tracking-tight text-slate-900">Caregiver link</div>
          <div className="text-sm text-slate-600 mt-1">Copy and send via SMS or email.</div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 break-all font-mono text-sm text-slate-800">
            {visitLink || '—'}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Button onClick={handleCopyLink} disabled={!visitLink}>
              <Copy className="w-4 h-4" />
              {sent ? 'Copied' : 'Copy'}
            </Button>
            <a className={visitLink ? '' : 'pointer-events-none opacity-50'} href={smsHref}>
              <Button variant="secondary" className="w-full">
                <MessageSquare className="w-4 h-4" /> SMS
              </Button>
            </a>
            <a className={visitLink ? '' : 'pointer-events-none opacity-50'} href={emailHref}>
              <Button variant="secondary" className="w-full">
                <Mail className="w-4 h-4" /> Email
              </Button>
            </a>
          </div>

          <div className="text-sm text-slate-600">
            Safety: this is a pre‑visit helper and cannot diagnose.
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link href="/visit">
          <Button variant="secondary" className="w-full sm:w-auto">Start/Join</Button>
        </Link>
        <Link href="/care-map">
          <Button variant="secondary" className="w-full sm:w-auto">Open care map</Button>
        </Link>
      </div>
    </main>
  );
}

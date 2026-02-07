'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DailyIframe, { DailyCall } from '@daily-co/daily-js';
import Link from 'next/link';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import { Modal } from '../../../components/ui/modal';
import { Tabs } from '../../../components/ui/tabs';
import { Skeleton } from '../../../components/ui/skeleton';
import { Camera, FileText, MapPinned, Share2, Mic, MicOff, Video, VideoOff, Captions as CaptionsIcon, PhoneOff } from 'lucide-react';

const API =
  (process.env.NEXT_PUBLIC_API_URL ?? '').trim() ||
  'http://localhost:4000';

type VisitInfo = {
  conversation_id: string;
  conversation_url: string;
  meeting_token?: string;
};

type NearbyResult = {
  name: string;
  address: string;
  phone?: string;
  distance_km?: number;
  rating?: number;
  coordinates: { lat: number; lng: number };
};

export default function VisitJoinPage() {
  const params = useParams();
  const router = useRouter();
  const conversationId = params.id as string;

  const containerRef = useRef<HTMLDivElement>(null);
  const callRef = useRef<DailyCall | null>(null);

  const [loading, setLoading] = useState(true);
  const [visit, setVisit] = useState<VisitInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const [captions, setCaptions] = useState('');
  const [captionsVisible, setCaptionsVisible] = useState(true);
  const [utterances, setUtterances] = useState<Array<{ speaker: 'user' | 'replica'; text: string; at: number }>>([]);
  const [shareCopied, setShareCopied] = useState(false);
  const [speakerConfirmedAsked, setSpeakerConfirmedAsked] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [rightTab, setRightTab] = useState<'captions' | 'notes' | 'actions'>('captions');
  const [joinedAt, setJoinedAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());

  const [planStep, setPlanStep] = useState<0 | 1 | 2 | 3>(0); // 0=not started, 1=AB, 2=C, 3=D, 4=EF via Next handler
  const [lastPlanPrompt, setLastPlanPrompt] = useState<string | null>(null);

  const [imageBusy, setImageBusy] = useState(false);
  const [imageNote, setImageNote] = useState<string | null>(null);

  const [geoBusy, setGeoBusy] = useState(false);
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [careType, setCareType] = useState('hospital');
  const [nearby, setNearby] = useState<NearbyResult[]>([]);
  const [routeInfo, setRouteInfo] = useState<string | null>(null);
  const [uberLink, setUberLink] = useState<string | null>(null);

  const joinUrl = useMemo(() => {
    if (!visit) return '';
    if (!visit.meeting_token) return visit.conversation_url;
    const sep = visit.conversation_url.includes('?') ? '&' : '?';
    return `${visit.conversation_url}${sep}t=${encodeURIComponent(visit.meeting_token)}`;
  }, [visit]);

  const shareUrl = useMemo(() => {
    if (!mounted) return '';
    const configured = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim();
    const origin =
      configured ||
      (typeof window !== 'undefined' ? window.location.origin : '');
    return origin ? `${origin}/visit/${conversationId}` : '';
  }, [conversationId, mounted]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!joined) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [joined]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`${API}/api/visit/${conversationId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? 'Visit not found');
        if (!cancelled) setVisit(data);
      } catch (e) {
        if (!cancelled) setLoadError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const startNewVisit = async () => {
    try {
      const res = await fetch(`${API}/api/visit/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok || !data?.conversation_id) {
        throw new Error(data?.error ?? data?.details ?? 'Could not start a new visit.');
      }
      router.push(`/visit/${data.conversation_id}`);
    } catch (e) {
      setJoinError(`Could not start a new visit. ${String(e)}`);
    }
  };

  const joinMeeting = async () => {
    if (!containerRef.current || !joinUrl) return;
    setJoinError(null);
    try {
      // If the user retries join, clear the previous frame to avoid stacking iframes.
      try {
        (callRef.current as any)?.destroy?.();
      } catch {}
      callRef.current = null;
      try {
        if (containerRef.current) containerRef.current.innerHTML = '';
      } catch {}

      const call = DailyIframe.createFrame(containerRef.current, {
        showLeaveButton: false,
        iframeStyle: {
          width: '100%',
          height: '100%',
          border: '0',
          borderRadius: '16px',
        },
      });
      callRef.current = call;

      call.on('joined-meeting', () => {
        setJoined(true);
        setJoinedAt(Date.now());
      });
      call.on('left-meeting', () => {
        setJoined(false);
        setJoinedAt(null);
      });

      call.on('app-message', (ev: any) => {
        try {
          const data = ev?.data;
          if (data?.event_type === 'conversation.utterance' && data?.properties) {
            const role = data.properties?.role; // 'user' | 'replica'
            const speech = data.properties?.speech;
            if (role && speech) {
              const text = String(speech);
              if (role === 'replica') setCaptions(text);
              setUtterances((prev) => {
                const speaker = (role === 'replica' ? 'replica' : 'user') as 'user' | 'replica';
                const next = [...prev, { speaker, text, at: Date.now() }];
                return next.slice(-60);
              });
              fetch(`${API}/api/visit/${conversationId}/utterance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ speaker: role === 'replica' ? 'replica' : 'user', text }),
              }).catch(() => {});

              // Multi-speaker cue detection (ask once per visit).
              if (!speakerConfirmedAsked && role === 'user') {
                const cue = /\b(tell (her|him)|my (mom|dad)|she said|he said|for my (mom|dad)|talking for|caregiver)\b/i;
                if (cue.test(text)) {
                  setSpeakerConfirmedAsked(true);
                  sendPrompt('Just to confirm—am I speaking with the patient, or a caregiver?');
                }
              }

              // Recap budget: after acknowledgement, keep future responses brief unless asked.
              if (role === 'user') {
                const ack = /\b(thanks|thank you|ok|okay|good|got it|sounds good)\b/i;
                if (ack.test(text)) {
                  appendContext('The user acknowledged. Do NOT repeat the full plan unless they explicitly ask. Keep the next response brief and ask what they want next.');
                }
              }
            }
          }
        } catch {
          // ignore
        }
      });

      await call.join({ url: joinUrl });
      await call.setLocalAudio(micOn);
      await call.setLocalVideo(camOn);
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === 'string'
            ? e
            : (() => {
                try {
                  return JSON.stringify(e);
                } catch {
                  return String(e);
                }
              })();
      const s = String(msg);
      if (s.includes('"type":"no-room"') || s.includes('no-room') || s.toLowerCase().includes('does not exist')) {
        setJoinError(
          'This meeting is no longer active (room not found). Ask the patient to start a new visit, or start a new visit now.'
        );
      } else {
        setJoinError(`Could not join the video room. ${s}`);
      }
    }
  };

  const toggleMic = async () => {
    const next = !micOn;
    setMicOn(next);
    await callRef.current?.setLocalAudio(next);
  };

  const toggleCam = async () => {
    const next = !camOn;
    setCamOn(next);
    await callRef.current?.setLocalVideo(next);
  };

  const sendPrompt = (text: string) => {
    if (!callRef.current || !visit?.conversation_id) return;
    callRef.current.sendAppMessage(
      {
        message_type: 'conversation',
        event_type: 'conversation.respond',
        conversation_id: visit.conversation_id,
        properties: { text },
      },
      '*'
    );
  };

  const appendContext = (context: string) => {
    if (!callRef.current || !visit?.conversation_id) return;
    callRef.current.sendAppMessage(
      {
        message_type: 'conversation',
        event_type: 'conversation.append_llm_context',
        conversation_id: visit.conversation_id,
        properties: { context },
      },
      '*'
    );
  };

  const sendPlanChunk = (chunk: 'AB' | 'C' | 'D' | 'EF' | 'BULLETS3' | 'SLOWER') => {
    const base =
      'Follow the recap budget: do not repeat a full recap unless asked. Use short turns: 2–3 sentences then a check-in question.';
    let prompt = '';
    if (chunk === 'AB') {
      prompt = `${base}\nDeliver ONLY: (A) So to summarize… (1–2 sentences) and (B) ask 1–2 clarifying questions you still need. End with “Would you like the next step?”`;
    } else if (chunk === 'C') {
      prompt = `${base}\nDeliver ONLY: Most likely causes (2–4 bullets) in plain language, conservative, not diagnostic. End with “Would you like the next step?”`;
    } else if (chunk === 'D') {
      prompt = `${base}\nDeliver ONLY: What you can do now (3–6 bullets) and Warning signs (3–6 bullets). End with “Would you like the next step?”`;
    } else if (chunk === 'EF') {
      prompt = `${base}\nDeliver ONLY: Who to see + Timeline. Then ask for teach-back: “Can you repeat the plan in one sentence?”`;
    } else if (chunk === 'BULLETS3') {
      prompt = `In 3 short bullets only: next steps + most important warning sign. No diagnosis. No dosing.`;
    } else if (chunk === 'SLOWER') {
      prompt = `Please slow down: use short sentences, pause often (“Okay—give me a second.”), and check understanding every 2–3 sentences.`;
      appendContext('User requested slower pacing. Keep responses short, pause often, and check understanding every 2–3 sentences.');
    }
    if (prompt) {
      setLastPlanPrompt(prompt);
      sendPrompt(prompt);
    }
  };

  const copyShare = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 1500);
  };

  const endVisit = async () => {
    try {
      await callRef.current?.leave();
    } catch {}
    // IMPORTANT: Do not automatically end the Tavus room for everyone.
    // Ending the room makes shared links show "no-room" for caregivers who join later.
    // If you need to fully end it, do so server-side or add an explicit "End for everyone" control.
    router.push(`/visit/${conversationId}/summary`);
  };

  const uploadImage = async (file: File) => {
    setImageBusy(true);
    setImageNote(null);
    try {
      const form = new FormData();
      form.append('image', file);
      const res = await fetch(`${API}/api/visit/${conversationId}/image`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Upload failed');
      setImageNote(`Image classified as “${data.analysis?.imageType}”. Sharing with doctor…`);
      if (data.tavus_prompt) sendPrompt(data.tavus_prompt);
    } catch (e) {
      setImageNote(`Upload failed: ${String(e)}`);
    } finally {
      setImageBusy(false);
    }
  };

  const getMyLocation = async () => {
    setGeoBusy(true);
    setRouteInfo(null);
    setUberLink(null);
    try {
      if (!navigator.geolocation) throw new Error('Location not supported in this browser');
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
      );
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setMyLoc(loc);
      return loc;
    } finally {
      setGeoBusy(false);
    }
  };

  const findCareNearby = async () => {
    setGeoBusy(true);
    setRouteInfo(null);
    setUberLink(null);
    try {
      const loc = myLoc ?? (await getMyLocation());
      const res = await fetch(`${API}/api/nearby-care?lat=${loc.lat}&lng=${loc.lng}&type=${encodeURIComponent(careType)}`);
      const data = await res.json();
      setNearby(data.results ?? []);
    } catch (e) {
      setNearby([]);
      setRouteInfo(`Could not find nearby care: ${String(e)}`);
    } finally {
      setGeoBusy(false);
    }
  };

  const getDirections = async (to: { lat: number; lng: number }) => {
    if (!myLoc) return;
    setGeoBusy(true);
    try {
      const r = await fetch(
        `${API}/api/route?fromLat=${myLoc.lat}&fromLng=${myLoc.lng}&toLat=${to.lat}&toLng=${to.lng}&mode=driving`
      );
      const data = await r.json();
      setRouteInfo(`ETA ~${Math.round(data.eta_minutes)} min (${data.mode}), distance ~${data.distance_km.toFixed(1)} km`);
      const t = await fetch(`${API}/api/transport/options?toLat=${to.lat}&toLng=${to.lng}`);
      const td = await t.json();
      setUberLink(td.uber_deeplink ?? null);
    } catch (e) {
      setRouteInfo(`Could not fetch route: ${String(e)}`);
    } finally {
      setGeoBusy(false);
    }
  };

  return (
    <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <Card className="bg-white/80 backdrop-blur">
        <CardContent className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">
              Visit <span className="font-mono">{conversationId}</span>
            </Badge>
            <Badge variant={joined ? 'success' : 'warning'}>{joined ? 'Connected' : 'Not connected'}</Badge>
            <Badge variant="info">
              {joinedAt
                ? (() => {
                    const s = Math.max(0, Math.floor((nowTick - joinedAt) / 1000));
                    const mm = String(Math.floor(s / 60)).padStart(2, '0');
                    const ss = String(s % 60).padStart(2, '0');
                    return `Elapsed ${mm}:${ss}`;
                  })()
                : 'Elapsed —'}
            </Badge>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setShareOpen(true)} disabled={!shareUrl}>
              <Share2 className="w-4 h-4" />
              Share
            </Button>
            <Link href={`/visit/${conversationId}/summary`}>
              <Button variant="secondary">
                <FileText className="w-4 h-4" />
                Summary
              </Button>
            </Link>
            <Button variant="destructive" onClick={endVisit}>
              <PhoneOff className="w-4 h-4" />
              End visit
            </Button>
          </div>
        </CardContent>
      </Card>

      <Modal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Share with caregiver"
        footer={
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="secondary" onClick={copyShare} disabled={!shareUrl} className="w-full sm:w-auto">
              {shareCopied ? 'Copied' : 'Copy link'}
            </Button>
            <Link href={`/visit/invite?visitId=${encodeURIComponent(conversationId)}`} className="w-full sm:w-auto">
              <Button className="w-full">Open invite page</Button>
            </Link>
          </div>
        }
      >
        <div className="text-sm text-slate-700">Share this link. Anyone with it can open the meeting:</div>
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-sm break-all">
          {shareUrl || '—'}
        </div>
        <div className="mt-3 text-xs text-slate-600">
          If this shows <span className="font-mono">localhost</span>, set <span className="font-mono">NEXT_PUBLIC_APP_URL</span> to your ngrok/deployed URL.
        </div>
      </Modal>

      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="text-sm text-amber-900">
          <span className="font-semibold">Safety:</span> This is a pre‑visit helper and cannot diagnose. If you have chest pain, trouble breathing, stroke symptoms, severe bleeding, or feel unsafe, call emergency services now.
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid gap-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-[340px]" />
        </div>
      ) : null}

      {loadError ? (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <div className="text-xl font-extrabold tracking-tight text-red-900">This visit link isn’t active</div>
            <div className="text-sm text-red-900/90 mt-1 break-words">{loadError}</div>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
            <Button onClick={startNewVisit}>Start a new visit</Button>
            <Link href="/"><Button variant="secondary" className="w-full sm:w-auto">Back home</Button></Link>
          </CardContent>
        </Card>
      ) : null}

      {joinError && !loadError ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <div className="text-xl font-extrabold tracking-tight text-amber-900">Could not join this meeting</div>
            <div className="text-sm text-amber-900/90 mt-1 break-words">{joinError}</div>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
            <Button onClick={startNewVisit}>Start a new visit</Button>
            {joinUrl ? (
              <a href={joinUrl} target="_blank" rel="noreferrer" className="w-full sm:w-auto">
                <Button variant="secondary" className="w-full">Open room in new tab</Button>
              </a>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {visit && !joined ? (
        <Card>
          <CardHeader>
            <div className="text-xl font-extrabold tracking-tight text-slate-900">Join the meeting</div>
            <div className="text-sm text-slate-600 mt-1">If embed fails, you can open the room in a new tab.</div>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
            <Button onClick={joinMeeting} className="w-full sm:w-auto">Join meeting</Button>
            {joinUrl ? (
              <a href={joinUrl} target="_blank" rel="noreferrer" className="w-full sm:w-auto">
                <Button variant="secondary" className="w-full">Open in new tab</Button>
              </a>
            ) : null}
            <Link href={`/visit/${conversationId}/photo`} className="w-full sm:w-auto">
              <Button variant="secondary" className="w-full"><Camera className="w-4 h-4" />Photos</Button>
            </Link>
            <Link href={`/visit/${conversationId}/care-map`} className="w-full sm:w-auto">
              <Button variant="secondary" className="w-full"><MapPinned className="w-4 h-4" />Care map</Button>
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="text-lg font-extrabold tracking-tight text-slate-900">Meeting</div>
              <div className="text-sm text-slate-600">Captions are on by default.</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Link href={`/visit/${conversationId}/photo`}><Button variant="secondary" size="md"><Camera className="w-4 h-4" />Photos</Button></Link>
              <Link href={`/visit/${conversationId}/care-map`}><Button variant="secondary" size="md"><MapPinned className="w-4 h-4" />Care map</Button></Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="bg-black rounded-2xl overflow-hidden aspect-video border border-slate-200">
              <div ref={containerRef} className="w-full h-full" />
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <div className="text-lg font-extrabold tracking-tight text-slate-900">Visit panel</div>
            <div className="text-sm text-slate-600 mt-1">Captions, notes, and actions.</div>
          </CardHeader>
          <CardContent className="pt-0">
            <Tabs
              value={rightTab}
              onChange={(id) => setRightTab(id as any)}
              tabs={[
                {
                  id: 'captions',
                  label: 'Captions',
                  content: (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-700">Live captions</div>
                        <Button variant="ghost" size="sm" onClick={() => setCaptionsVisible((v) => !v)}>
                          <CaptionsIcon className="w-4 h-4" />
                          {captionsVisible ? 'Hide' : 'Show'}
                        </Button>
                      </div>
                      {captionsVisible ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-900 min-h-[88px]">
                          {captions || <span className="text-slate-600">Waiting for the clinician avatar…</span>}
                        </div>
                      ) : (
                        <div className="text-sm text-slate-600">Captions hidden.</div>
                      )}
                      <div className="rounded-2xl border border-slate-200 p-4">
                        <div className="text-sm font-semibold text-slate-700">Recent</div>
                        <ul className="mt-2 space-y-2 max-h-56 overflow-auto text-sm">
                          {utterances
                            .slice(-12)
                            .reverse()
                            .map((u, i) => (
                              <li key={i} className="text-slate-800">
                                <span className="font-semibold">{u.speaker === 'user' ? 'You' : 'Clinician'}:</span> {u.text}
                              </li>
                            ))}
                          {!utterances.length ? <li className="text-slate-600">No transcript yet.</li> : null}
                        </ul>
                      </div>
                    </div>
                  ),
                },
                {
                  id: 'notes',
                  label: 'Notes',
                  content: (
                    <div className="space-y-3">
                      <div className="text-sm font-semibold text-slate-700">Visit notes (auto)</div>
                      <div className="rounded-2xl border border-slate-200 p-4">
                        <ul className="list-disc pl-6 text-sm text-slate-800 space-y-2">
                          {utterances
                            .filter((u) => u.speaker === 'user')
                            .slice(-10)
                            .reverse()
                            .map((u, i) => (
                              <li key={i}>{u.text}</li>
                            ))}
                          {!utterances.filter((u) => u.speaker === 'user').length ? (
                            <li className="text-slate-600">Start talking and your key points will appear here.</li>
                          ) : null}
                        </ul>
                      </div>
                    </div>
                  ),
                },
                {
                  id: 'actions',
                  label: 'Actions',
                  content: (
                    <div className="space-y-3">
                      <div className="text-sm font-semibold text-slate-700">Quick actions</div>
                      <div className="grid gap-2">
                        <Button
                          variant="secondary"
                          size="md"
                          onClick={() =>
                            sendPrompt(
                              'Please ask me the next important question, one at a time, to understand my symptoms. Avoid repeating the full recap unless I ask.'
                            )
                          }
                          disabled={!joined}
                        >
                          Guide triage questions
                        </Button>
                        <Button
                          variant="secondary"
                          size="md"
                          onClick={() => {
                            setPlanStep(1);
                            sendPlanChunk('AB');
                          }}
                          disabled={!joined}
                        >
                          Start plan
                        </Button>
                        <Button
                          variant="secondary"
                          size="md"
                          onClick={() => {
                            if (planStep === 0) {
                              setPlanStep(1);
                              sendPlanChunk('AB');
                              return;
                            }
                            if (planStep === 1) {
                              setPlanStep(2);
                              sendPlanChunk('C');
                            } else if (planStep === 2) {
                              setPlanStep(3);
                              sendPlanChunk('D');
                            } else {
                              setPlanStep(0);
                              sendPlanChunk('EF');
                            }
                          }}
                          disabled={!joined}
                        >
                          Next step
                        </Button>
                        <Button
                          variant="secondary"
                          size="md"
                          onClick={() => {
                            if (lastPlanPrompt) sendPrompt(lastPlanPrompt);
                            else sendPlanChunk('AB');
                          }}
                          disabled={!joined}
                        >
                          Repeat
                        </Button>
                        <Button variant="secondary" size="md" onClick={() => sendPlanChunk('SLOWER')} disabled={!joined}>
                          Slower
                        </Button>
                        <Button variant="secondary" size="md" onClick={() => sendPlanChunk('BULLETS3')} disabled={!joined}>
                          Summarize in 3 bullets
                        </Button>
                      </div>
                      <div className="pt-2 border-t border-slate-200" />
                      <div className="grid gap-2">
                        <Link href={`/visit/${conversationId}/summary`}><Button size="md" className="w-full">Go to summary</Button></Link>
                        <Link href={`/visit/${conversationId}/photo`}><Button variant="secondary" size="md" className="w-full">Open photos</Button></Link>
                        <Link href={`/visit/${conversationId}/care-map`}><Button variant="secondary" size="md" className="w-full">Open care map</Button></Link>
                      </div>
                    </div>
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <div className="sticky bottom-4">
        <div className="rounded-2xl border border-slate-200 bg-white/90 backdrop-blur p-3 shadow-sm flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="text-sm text-slate-600">{joined ? 'In call. Use controls below.' : 'Not connected yet.'}</div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="secondary" size="md" onClick={toggleMic} disabled={!joined}>
              {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              {micOn ? 'Mute' : 'Unmute'}
            </Button>
            <Button variant="secondary" size="md" onClick={toggleCam} disabled={!joined}>
              {camOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              {camOn ? 'Camera' : 'Camera off'}
            </Button>
            <Button variant="secondary" size="md" onClick={() => setCaptionsVisible((v) => !v)}>
              <CaptionsIcon className="w-4 h-4" />
              {captionsVisible ? 'Captions on' : 'Captions off'}
            </Button>
            <Button variant="destructive" size="md" onClick={endVisit}>
              <PhoneOff className="w-4 h-4" />
              End
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}


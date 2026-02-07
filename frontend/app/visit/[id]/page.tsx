'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DailyIframe, { DailyCall } from '@daily-co/daily-js';

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
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const [captions, setCaptions] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [speakerConfirmedAsked, setSpeakerConfirmedAsked] = useState(false);

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
    const configured = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim();
    const origin =
      configured ||
      (typeof window !== 'undefined' ? window.location.origin : '');
    return origin ? `${origin}/visit/${conversationId}` : '';
  }, [conversationId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API}/api/visit/${conversationId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? 'Visit not found');
        if (!cancelled) setVisit(data);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const joinMeeting = async () => {
    if (!containerRef.current || !joinUrl) return;
    setError(null);
    try {
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

      call.on('joined-meeting', () => setJoined(true));
      call.on('left-meeting', () => setJoined(false));

      call.on('app-message', (ev: any) => {
        try {
          const data = ev?.data;
          if (data?.event_type === 'conversation.utterance' && data?.properties) {
            const role = data.properties?.role; // 'user' | 'replica'
            const speech = data.properties?.speech;
            if (role && speech) {
              if (role === 'replica') setCaptions(String(speech));
              fetch(`${API}/api/visit/${conversationId}/utterance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ speaker: role === 'replica' ? 'replica' : 'user', text: String(speech) }),
              }).catch(() => {});

              // Multi-speaker cue detection (ask once per visit).
              if (!speakerConfirmedAsked && role === 'user') {
                const cue = /\b(tell (her|him)|my (mom|dad)|she said|he said|for my (mom|dad)|talking for|caregiver)\b/i;
                if (cue.test(String(speech))) {
                  setSpeakerConfirmedAsked(true);
                  sendPrompt('Just to confirm—am I speaking with the patient, or a caregiver?');
                }
              }

              // Recap budget: after acknowledgement, keep future responses brief unless asked.
              if (role === 'user') {
                const ack = /\b(thanks|thank you|ok|okay|good|got it|sounds good)\b/i;
                if (ack.test(String(speech))) {
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
      setError(`Could not join the video room. ${msg}`);
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
    try {
      await fetch(`${API}/api/tavus/conversation/${conversationId}/end`, { method: 'POST' });
    } catch {}
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
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-senior-2xl font-bold text-slate-900">CareZoom video visit</h1>
          <div className="flex gap-3">
            <button className="senior-btn-secondary text-senior" onClick={copyShare} disabled={!shareUrl}>
              {shareCopied ? 'Copied link' : 'Invite caregiver'}
            </button>
            <button className="senior-btn-secondary text-senior" onClick={endVisit}>
              End visit
            </button>
          </div>
        </header>

        <div className="bg-white border border-slate-200 rounded-xl p-4 text-senior text-slate-700">
          This is a <strong>pre-visit</strong> helper. The doctor avatar can’t diagnose. It will share possible causes,
          warning signs, and next steps. If you have chest pain, trouble breathing, stroke symptoms, severe bleeding, or
          feel unsafe, call 911 now.
          {shareUrl && (
            <div className="mt-2 break-all text-slate-600">
              Caregiver link: <span className="font-mono">{shareUrl}</span>
              <div className="text-sm mt-1">
                To share beyond localhost, run an ngrok tunnel and set <code>NEXT_PUBLIC_APP_URL</code> to your ngrok URL.
              </div>
            </div>
          )}
        </div>

        {loading && <div className="bg-white border border-slate-200 rounded-xl p-6 text-senior">Loading visit…</div>}
        {error && (
          <div className="bg-red-50 border-2 border-red-500 rounded-xl p-6 text-senior">
            <p className="font-bold">This visit link isn’t active.</p>
            <p className="mt-2 break-words">{error}</p>
            <p className="mt-2">Start a new visit from the home page, then share the new link.</p>
          </div>
        )}

        {visit && !joined && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <button className="senior-btn w-full" onClick={joinMeeting}>
              Join meeting
            </button>
            <a className="text-teal-700 underline text-senior block" href={joinUrl} target="_blank" rel="noreferrer">
              If embed doesn’t work, open Tavus room in a new tab
            </a>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <div className="bg-black rounded-2xl overflow-hidden aspect-video">
              <div ref={containerRef} className="w-full h-full" />
            </div>
            {captions && (
              <div className="caption-box mt-3">
                <p className="font-medium mb-2">Captions</p>
                <p>{captions}</p>
              </div>
            )}
          </div>

          <aside className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
            <div>
              <p className="font-bold text-senior-lg">Controls</p>
              <div className="grid gap-2 mt-2">
                <button className="senior-btn-secondary w-full text-senior" onClick={toggleMic} disabled={!joined}>
                  {micOn ? 'Mute microphone' : 'Unmute microphone'}
                </button>
                <button className="senior-btn-secondary w-full text-senior" onClick={toggleCam} disabled={!joined}>
                  {camOn ? 'Turn camera off' : 'Turn camera on'}
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200" />

            <div>
              <p className="font-bold text-senior">Quick actions</p>
              <div className="grid gap-2 mt-2">
                <button
                  className="senior-btn-secondary w-full text-senior"
                  onClick={() => sendPrompt('Please ask me the next important question, one at a time, to understand my symptoms. Avoid repeating the full recap unless I ask.')}
                  disabled={!joined}
                >
                  Guide triage questions
                </button>
                <button
                  className="senior-btn-secondary w-full text-senior"
                  onClick={() => {
                    setPlanStep(1);
                    sendPlanChunk('AB');
                  }}
                  disabled={!joined}
                >
                  Start plan (step 1)
                </button>
                <button
                  className="senior-btn-secondary w-full text-senior"
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
                </button>
                <button
                  className="senior-btn-secondary w-full text-senior"
                  onClick={() => {
                    if (lastPlanPrompt) sendPrompt(lastPlanPrompt);
                    else sendPlanChunk('AB');
                  }}
                  disabled={!joined}
                >
                  Repeat
                </button>
                <button
                  className="senior-btn-secondary w-full text-senior"
                  onClick={() => sendPlanChunk('SLOWER')}
                  disabled={!joined}
                >
                  Slower
                </button>
                <button
                  className="senior-btn-secondary w-full text-senior"
                  onClick={() => sendPlanChunk('BULLETS3')}
                  disabled={!joined}
                >
                  Summarize in 3 bullets
                </button>
                <button
                  className="senior-btn-secondary w-full text-senior"
                  onClick={() => sendPrompt('Please ask me to repeat the plan in my own words (teach-back).')}
                  disabled={!joined}
                >
                  Teach-back
                </button>
                <button className="senior-btn w-full" onClick={() => router.push(`/visit/${conversationId}/summary`)}>
                  Get summary
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200" />

            <div>
              <p className="font-bold text-senior">Upload photo</p>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={!joined || imageBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadImage(f);
                  e.currentTarget.value = '';
                }}
                className="block w-full text-senior mt-2"
              />
              {imageNote && <p className="text-sm text-slate-600 mt-2">{imageNote}</p>}
            </div>

            <div className="pt-2 border-t border-slate-200" />

            <div>
              <p className="font-bold text-senior">Find care nearby</p>
              <div className="grid gap-2 mt-2">
                <select className="senior-input" value={careType} onChange={(e) => setCareType(e.target.value)}>
                  <option value="hospital">Hospital / ER</option>
                  <option value="urgent_care">Urgent care</option>
                  <option value="doctor">Doctor</option>
                  <option value="dermatologist">Dermatologist</option>
                </select>
                <button className="senior-btn-secondary w-full text-senior" onClick={findCareNearby} disabled={geoBusy}>
                  {geoBusy ? 'Searching…' : 'Use my location & search'}
                </button>
                {routeInfo && <p className="text-sm text-slate-600">{routeInfo}</p>}
                {uberLink && (
                  <a className="text-teal-700 underline text-senior" href={uberLink} target="_blank" rel="noreferrer">
                    Open Uber
                  </a>
                )}
              </div>

              {nearby.length > 0 && (
                <ul className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                  {nearby.map((p, idx) => (
                    <li key={idx} className="border border-slate-200 rounded-lg p-3">
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-sm text-slate-600">{p.address || 'Address not listed'}</div>
                      {p.phone && (
                        <a className="text-teal-700 underline text-sm" href={`tel:${p.phone}`}>
                          Call {p.phone}
                        </a>
                      )}
                      {p.distance_km != null && (
                        <div className="text-sm text-slate-600">~{p.distance_km.toFixed(1)} km away</div>
                      )}
                      <button
                        className="senior-btn-secondary w-full text-senior mt-2"
                        onClick={() => {
                          if (!myLoc) return;
                          getDirections(p.coordinates);
                        }}
                        disabled={!myLoc || geoBusy}
                      >
                        Get route & transport
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}


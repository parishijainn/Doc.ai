'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';

export function CameraScanner(props: { onCapture: (dataUrl: string) => void; disabled?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'starting' | 'live' | 'captured'>('idle');

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(
    async (facingMode: 'user' | 'environment' = 'environment') => {
      setError(null);
      setStatus('starting');
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera is not available in this browser.');
        setStatus('idle');
        return;
      }
      try {
        stopStream();
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (!v) throw new Error('Video element not ready');
        v.srcObject = stream;
        v.onloadedmetadata = () => v.play().catch(() => {});
        await v.play().catch(() => {});
        setStatus('live');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('idle');
      }
    },
    [stopStream]
  );

  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  const capture = useCallback(() => {
    const v = videoRef.current;
    if (!v || !streamRef.current || v.readyState < 2) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setPreview(dataUrl);
    setStatus('captured');
    stopStream();
  }, [stopStream]);

  const retake = useCallback(() => {
    setPreview(null);
    startCamera('environment');
  }, [startCamera]);

  const confirm = useCallback(() => {
    if (preview) props.onCapture(preview);
  }, [preview, props]);

  if (props.disabled) {
    return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Camera disabled.</div>;
  }

  return (
    <div className="space-y-3">
      {error ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</div> : null}

      {status === 'idle' && !preview ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="text-sm text-slate-700">Start the camera and center the medication label in the frame.</div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={() => startCamera('environment')} type="button">
              Start camera
            </Button>
            <Button variant="secondary" size="sm" onClick={() => startCamera('user')} type="button">
              Use front camera
            </Button>
          </div>
        </div>
      ) : null}

      {(status === 'starting' || status === 'live') && (
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3] max-h-[420px] border border-slate-200">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <div className="absolute inset-0 pointer-events-none border-[6px] border-emerald-400/60 m-8 rounded-xl" />
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => { stopStream(); setStatus('idle'); }} type="button">
              Cancel
            </Button>
            <Button size="sm" onClick={capture} disabled={status !== 'live'} type="button">
              Capture
            </Button>
          </div>
        </div>
      )}

      {status === 'captured' && preview ? (
        <div className="space-y-2">
          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Captured label" className="w-full h-auto" />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" size="sm" onClick={retake} type="button">
              Retake
            </Button>
            <Button size="sm" onClick={confirm} type="button">
              Use this scan
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}


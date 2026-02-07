'use client';

import { useCallback, useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader } from '../ui/card';
import { CameraScanner } from './CameraScanner';
import { normalizeOCROutput } from '../../lib/otc/ocr';
import { fuzzyMatchOCR, getAllMedications, getMedicationById } from '../../lib/otc/match';
import { checkOCRConfidence } from '../../lib/otc/safety';
import type { MedicationMatch, OCRExtract, OTCMedication, OtcPlanResponse, SymptomInput, UsagePlan } from '../../lib/otc/types';

type Step = 'scan' | 'confirm' | 'symptoms' | 'result';

async function preprocessImageForOCR(dataUrl: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Failed to load captured image'));
    i.src = dataUrl;
  });

  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const inset = 0.12;
  const cropX = Math.floor(srcW * inset);
  const cropY = Math.floor(srcH * inset);
  const cropW = Math.floor(srcW * (1 - inset * 2));
  const cropH = Math.floor(srcH * (1 - inset * 2));

  const targetW = Math.min(1600, Math.max(900, cropW));
  const scale = targetW / cropW;
  const targetH = Math.floor(cropH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return dataUrl;

  ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);

  const imageData = ctx.getImageData(0, 0, targetW, targetH);
  const d = imageData.data;
  const contrast = 1.18;
  const intercept = 128 * (1 - contrast);
  const hist = new Array<number>(256).fill(0);

  for (let p = 0; p < d.length; p += 4) {
    const r = d[p];
    const g = d[p + 1];
    const b = d[p + 2];
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const yc = Math.max(0, Math.min(255, y * contrast + intercept));
    d[p] = yc;
    d[p + 1] = yc;
    d[p + 2] = yc;
    hist[yc | 0] += 1;
  }

  // Otsu threshold
  const total = targetW * targetH;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let varMax = 0;
  let threshold = 160;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > varMax) {
      varMax = between;
      threshold = t;
    }
  }
  for (let p = 0; p < d.length; p += 4) {
    const v = d[p];
    const out = v > threshold ? 255 : 0;
    d[p] = out;
    d[p + 1] = out;
    d[p + 2] = out;
  }
  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL('image/jpeg', 0.92);
}

function buildShareText(args: { medication: OTCMedication; input: SymptomInput; plan?: UsagePlan; emergencyMessage?: string }): string {
  const { medication: m, input, plan, emergencyMessage } = args;
  const lines: string[] = [];
  lines.push('Medication scan (OTC label):');
  lines.push(`- Medication: ${m.name} (${m.active_ingredient} · ${m.strength})`);
  lines.push(`- Standard label dose: ${m.standard_label_dose}`);
  lines.push(`- Label max: ${m.max_daily_dose}`);
  if (m.contraindications?.length) lines.push(`- Avoid if: ${m.contraindications.join('; ')}`);
  lines.push('');
  lines.push('Patient input:');
  lines.push(`- Age: ${input.age}`);
  lines.push(`- Symptoms: ${(input.symptoms ?? []).join(', ') || '—'}`);
  lines.push(`- Severity: ${input.severity}/10`);
  if (input.otherSymptoms) lines.push(`- Other symptoms: ${input.otherSymptoms}`);
  if (input.otherMeds) lines.push(`- Other meds: ${input.otherMeds}`);
  lines.push('');
  if (emergencyMessage) {
    lines.push('Emergency note:');
    lines.push(emergencyMessage);
  } else if (plan) {
    lines.push('Draft plan (label-based):');
    lines.push(`- Helps with: ${plan.helpsWithSymptoms}`);
    lines.push(`- Safe label usage: ${plan.labelUsagePlan}`);
    lines.push(`- Do not exceed: ${plan.doNotExceed}`);
    lines.push(`- Avoid if: ${plan.avoidIf}`);
    lines.push(`- Interaction warnings: ${plan.interactionWarnings}`);
    lines.push(`- Seek care triggers: ${plan.seekCareTriggers}`);
  }
  lines.push('');
  lines.push('Please incorporate this into your recommendation. No diagnosis; no dosing beyond label.');
  return lines.join('\n');
}

export function OtcMedicationScanner(props: {
  apiBaseUrl: string;
  conversationId?: string;
  enabled?: boolean;
  onShareToDoctor?: (tavusPrompt: string) => void;
}) {
  const enabled = props.enabled ?? true;
  const [step, setStep] = useState<Step>('scan');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [ocrExtract, setOcrExtract] = useState<OCRExtract | null>(null);
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);

  const [matches, setMatches] = useState<MedicationMatch[]>([]);
  const [selectedMedication, setSelectedMedication] = useState<OTCMedication | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [manualListOpen, setManualListOpen] = useState(false);

  const [symptomInput, setSymptomInput] = useState<Partial<SymptomInput>>({
    symptoms: [],
    severity: 5,
    age: undefined,
    otherMeds: '',
    otherSymptoms: '',
    proceedDespiteInteraction: false,
  });

  const [planLoading, setPlanLoading] = useState(false);
  const [plan, setPlan] = useState<UsagePlan | null>(null);
  const [emergencyMessage, setEmergencyMessage] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [tavusPrompt, setTavusPrompt] = useState<string | null>(null);

  const allMeds = useMemo(() => getAllMedications(), []);

  const reset = useCallback(() => {
    setStep('scan');
    setCapturedImage(null);
    setOcrExtract(null);
    setOcrStatus(null);
    setOcrError(null);
    setMatches([]);
    setSelectedMedication(null);
    setMatchLoading(false);
    setManualListOpen(false);
    setPlanLoading(false);
    setPlan(null);
    setEmergencyMessage(null);
    setPlanError(null);
    setTavusPrompt(null);
    setSymptomInput({
      symptoms: [],
      severity: 5,
      age: undefined,
      otherMeds: '',
      otherSymptoms: '',
      proceedDespiteInteraction: false,
    });
  }, []);

  const processDataUrl = useCallback(async (dataUrl: string) => {
      setOcrError(null);
      setOcrExtract(null);
      setOcrStatus('Preparing image…');
      setMatches([]);
      setSelectedMedication(null);
      setMatchLoading(true);
      setStep('confirm');
      setCapturedImage(dataUrl);

      try {
        const { createWorker } = await import('tesseract.js');
        const ocrImage = await preprocessImageForOCR(dataUrl);
        const worker = await createWorker('eng', undefined, {
          logger: (m: { status?: string; progress?: number }) => {
            if (m?.status) {
              const pct = typeof m.progress === 'number' ? ` (${Math.round(m.progress * 100)}%)` : '';
              setOcrStatus(`${m.status}${pct}`);
            }
          },
          workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
          langPath: 'https://tessdata.projectnaptha.com/4.0.0',
        });

        await worker.setParameters({
          tessedit_pageseg_mode: 6 as unknown as never,
          preserve_interword_spaces: '1',
        });
        const { data } = await worker.recognize(ocrImage);
        await worker.terminate();

        const lines = String(data?.text ?? '')
          .split('\n')
          .map((x) => x.trim())
          .filter(Boolean);

        const normalized = normalizeOCROutput(lines, typeof data?.confidence === 'number' ? data.confidence / 100 : 0.5);
        const extract: OCRExtract = {
          medicationName: normalized.medicationName,
          ingredients: normalized.ingredients,
          dosage: normalized.dosage,
          warnings: normalized.warnings,
          rawText: normalized.rawText,
          confidence: normalized.confidence,
        };
        setOcrExtract(extract);

        const confCheck = checkOCRConfidence(extract.confidence);
        if (!confCheck.ok) {
          setOcrError(confCheck.error ?? 'Low OCR confidence');
        }

        const m = fuzzyMatchOCR(extract).map((x) => ({
          medication: x.medication,
          confidence: x.confidence,
          matchedFields: x.matchedFields,
        })) as MedicationMatch[];
        setMatches(m);
      } catch (e) {
        setOcrError(String(e));
      } finally {
        setMatchLoading(false);
        setOcrStatus(null);
      }
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
      await processDataUrl(dataUrl);
    },
    [processDataUrl]
  );

  const proceedToSymptoms = useCallback(() => {
    if (!selectedMedication) return;
    setStep('symptoms');
  }, [selectedMedication]);

  const generate = useCallback(async () => {
    setPlanLoading(true);
    setPlan(null);
    setEmergencyMessage(null);
    setPlanError(null);
    setTavusPrompt(null);
    try {
      if (!selectedMedication) throw new Error('Select a medication first');
      const age = Number(symptomInput.age);
      if (!Number.isFinite(age) || age <= 0) throw new Error('Enter age');

      const input: SymptomInput = {
        symptoms: (symptomInput.symptoms ?? []) as any,
        severity: Number(symptomInput.severity ?? 5),
        age,
        otherMeds: String(symptomInput.otherMeds ?? ''),
        otherSymptoms: String(symptomInput.otherSymptoms ?? '') || undefined,
        proceedDespiteInteraction: Boolean(symptomInput.proceedDespiteInteraction),
      };

      const endpoint = props.conversationId
        ? `${props.apiBaseUrl}/api/visit/${encodeURIComponent(props.conversationId)}/otc-plan`
        : `${props.apiBaseUrl}/api/otc/plan`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medication: selectedMedication, symptomInput: input, ocrExtract }),
      });
      const data = (await res.json()) as OtcPlanResponse;
      if (!res.ok || !data) throw new Error((data as any)?.error ?? 'Failed to generate plan');

      if (data.success && 'emergency' in data && data.emergency) {
        setEmergencyMessage(data.emergencyMessage);
        setTavusPrompt(data.tavus_prompt);
        setStep('result');
        return;
      }

      if (data.success && 'plan' in data) {
        setPlan(data.plan);
        setTavusPrompt(data.tavus_prompt);
        setStep('result');
        return;
      }
      throw new Error('Unexpected response');
    } catch (e) {
      // Client-side fallback if backend fails
      if (selectedMedication && symptomInput.age) {
        const input: SymptomInput = {
          symptoms: (symptomInput.symptoms ?? []) as any,
          severity: Number(symptomInput.severity ?? 5),
          age: Number(symptomInput.age),
          otherMeds: String(symptomInput.otherMeds ?? ''),
          otherSymptoms: String(symptomInput.otherSymptoms ?? '') || undefined,
          proceedDespiteInteraction: Boolean(symptomInput.proceedDespiteInteraction),
        };
        const fallback: UsagePlan = {
          helpsWithSymptoms: selectedMedication.symptom_targets?.length
            ? `May help with: ${selectedMedication.symptom_targets.join(', ')}.`
            : 'Use label indications only.',
          labelUsagePlan: selectedMedication.standard_label_dose,
          doNotExceed: selectedMedication.max_daily_dose,
          avoidIf: selectedMedication.contraindications?.join('; ') || 'See label.',
          interactionWarnings: 'Check with your pharmacist/doctor if you take other medicines.',
          seekCareTriggers: 'If symptoms persist, worsen, or you are worried, seek medical care.',
          disclaimer: 'Label-based guidance only; not a substitute for professional medical care.',
        };
        setPlan(fallback);
        const prompt = buildShareText({ medication: selectedMedication, input, plan: fallback });
        setTavusPrompt(prompt);
        setPlanError(`Using fallback: ${String(e)}`);
        setStep('result');
      } else {
        setPlanError(String(e));
      }
    } finally {
      setPlanLoading(false);
    }
  }, [ocrExtract, props.apiBaseUrl, props.conversationId, selectedMedication, symptomInput]);

  const manualPick = (id: string) => {
    const med = getMedicationById(id);
    if (!med) return;
    setSelectedMedication(med);
    setMatches([{ medication: med, confidence: 1, matchedFields: ['manual'] }]);
    setManualListOpen(false);
  };

  const share = () => {
    if (tavusPrompt && props.onShareToDoctor) props.onShareToDoctor(tavusPrompt);
  };

  const copy = async () => {
    if (!tavusPrompt) return;
    try {
      await navigator.clipboard.writeText(tavusPrompt);
    } catch {}
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <div className="text-lg font-extrabold tracking-tight text-slate-900">Medication scanner (OTC)</div>
          <div className="text-sm text-slate-600">Scan a label, confirm the medication, then generate a label-based plan.</div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!enabled ? <div className="text-sm text-slate-600">Join the meeting first to share with the doctor.</div> : null}

          {step === 'scan' ? (
            <div className="space-y-2">
              <CameraScanner
                onCapture={(dataUrl) => {
                  processDataUrl(dataUrl);
                }}
                disabled={!enabled}
              />
              <div className="text-xs text-slate-600">
                If camera access fails, you can upload a photo instead.
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.currentTarget.value = '';
                }}
              />
            </div>
          ) : null}

          {ocrStatus ? <div className="text-sm text-slate-600">{ocrStatus}</div> : null}
          {ocrError ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{ocrError}</div> : null}

          {capturedImage ? (
            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={capturedImage} alt="Captured label" className="w-full h-auto" />
            </div>
          ) : null}

          {step === 'confirm' ? (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-slate-700">Confirm medication</div>
              {matchLoading ? <div className="text-sm text-slate-600">Matching…</div> : null}
              {!matchLoading && matches.length ? (
                <div className="space-y-2">
                  {matches.map((m) => (
                    <button
                      key={m.medication.id}
                      className={`w-full text-left rounded-xl border px-4 py-3 ${
                        selectedMedication?.id === m.medication.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200'
                      }`}
                      onClick={() => setSelectedMedication(m.medication)}
                      type="button"
                    >
                      <div className="font-semibold text-slate-900">{m.medication.name}</div>
                      <div className="text-xs text-slate-600">
                        {m.medication.active_ingredient} · {m.medication.strength} · match {(m.confidence * 100).toFixed(0)}%
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="flex gap-2 flex-wrap pt-1">
                <Button variant="secondary" size="sm" onClick={() => setManualListOpen((v) => !v)} type="button">
                  Pick from list
                </Button>
                <Button variant="secondary" size="sm" onClick={reset} type="button">
                  Rescan
                </Button>
                <Button onClick={proceedToSymptoms} disabled={!selectedMedication} size="sm" type="button">
                  Continue
                </Button>
              </div>

              {manualListOpen ? (
                <div className="rounded-2xl border border-slate-200 p-3 max-h-56 overflow-auto">
                  <div className="text-xs text-slate-600 mb-2">Select a medication:</div>
                  <div className="grid gap-2">
                    {allMeds.map((m) => (
                      <button
                        key={m.id}
                        className="text-left rounded-xl border border-slate-200 px-3 py-2 hover:bg-slate-50"
                        onClick={() => manualPick(m.id)}
                        type="button"
                      >
                        <div className="text-sm font-semibold text-slate-900">{m.name}</div>
                        <div className="text-xs text-slate-600">
                          {m.active_ingredient} · {m.strength}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 'symptoms' ? (
            <div className="space-y-3">
              <div className="text-sm font-semibold text-slate-700">Patient input</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-slate-600 mb-1">Age</div>
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                    type="number"
                    min={1}
                    max={120}
                    value={symptomInput.age ?? ''}
                    onChange={(e) => setSymptomInput((v) => ({ ...v, age: e.target.value ? Number(e.target.value) : undefined }))}
                  />
                </div>
                <div>
                  <div className="text-xs text-slate-600 mb-1">Severity (1–10)</div>
                  <input
                    className="w-full"
                    type="range"
                    min={1}
                    max={10}
                    value={symptomInput.severity ?? 5}
                    onChange={(e) => setSymptomInput((v) => ({ ...v, severity: Number(e.target.value) }))}
                  />
                  <div className="text-xs text-slate-600">{symptomInput.severity ?? 5}</div>
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-600 mb-1">Symptoms (comma separated)</div>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={(symptomInput.symptoms ?? []).join(', ')}
                  onChange={(e) =>
                    setSymptomInput((v) => ({
                      ...v,
                      symptoms: e.target.value
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean) as any,
                    }))
                  }
                />
              </div>

              <div>
                <div className="text-xs text-slate-600 mb-1">Other symptoms (optional)</div>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={symptomInput.otherSymptoms ?? ''}
                  onChange={(e) => setSymptomInput((v) => ({ ...v, otherSymptoms: e.target.value }))}
                />
              </div>
              <div>
                <div className="text-xs text-slate-600 mb-1">Other medications (optional)</div>
                <textarea
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  rows={3}
                  value={symptomInput.otherMeds ?? ''}
                  onChange={(e) => setSymptomInput((v) => ({ ...v, otherMeds: e.target.value }))}
                />
              </div>

              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={Boolean(symptomInput.proceedDespiteInteraction)}
                  onChange={(e) => setSymptomInput((v) => ({ ...v, proceedDespiteInteraction: e.target.checked }))}
                />
                <span>
                  I confirm I want to proceed even if interaction warnings are detected (for example, duplicate active
                  ingredient).
                </span>
              </label>

              <div className="flex gap-2 flex-wrap">
                <Button variant="secondary" size="sm" onClick={() => setStep('confirm')} type="button">
                  Back
                </Button>
                <Button onClick={generate} size="sm" type="button">
                  Generate plan
                </Button>
              </div>
            </div>
          ) : null}

          {step === 'result' ? (
            <div className="space-y-3">
              {planLoading ? <div className="text-sm text-slate-600">Generating…</div> : null}
              {planError ? <div className="text-xs text-amber-700">{planError}</div> : null}

              {emergencyMessage ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{emergencyMessage}</div>
              ) : null}

              {plan ? (
                <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-800 space-y-2">
                  <div>
                    <div className="font-semibold">Helps with</div>
                    <div className="text-slate-700">{plan.helpsWithSymptoms}</div>
                  </div>
                  <div>
                    <div className="font-semibold">Safe label usage</div>
                    <div className="text-slate-700">{plan.labelUsagePlan}</div>
                  </div>
                  <div>
                    <div className="font-semibold">Do not exceed</div>
                    <div className="text-slate-700">{plan.doNotExceed}</div>
                  </div>
                  <div>
                    <div className="font-semibold">Avoid if</div>
                    <div className="text-slate-700">{plan.avoidIf}</div>
                  </div>
                  <div>
                    <div className="font-semibold">Interaction warnings</div>
                    <div className="text-slate-700">{plan.interactionWarnings}</div>
                  </div>
                  <div>
                    <div className="font-semibold">Seek care triggers</div>
                    <div className="text-slate-700">{plan.seekCareTriggers}</div>
                  </div>
                </div>
              ) : null}

              <div className="flex gap-2 flex-wrap">
                <Button variant="secondary" size="sm" onClick={reset} type="button">
                  New scan
                </Button>
                <Button variant="secondary" size="sm" onClick={copy} disabled={!tavusPrompt} type="button">
                  Copy note for doctor
                </Button>
                {props.onShareToDoctor ? (
                  <Button variant="secondary" size="sm" onClick={share} disabled={!enabled || !tavusPrompt} type="button">
                    Share with doctor in meeting
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}


import { config, hasOpenAI } from '../config.js';

export type OTCMedication = {
  id: string;
  name: string;
  active_ingredient: string;
  strength: string;
  standard_label_dose: string;
  max_daily_dose: string;
  symptom_targets: string[];
  contraindications: string[];
  min_age_years?: number;
  do_not_use_with?: string[];
};

export type SymptomInput = {
  symptoms: string[];
  severity: number; // 1-10
  age: number;
  otherMeds: string;
  otherSymptoms?: string;
  proceedDespiteInteraction?: boolean;
};

export type UsagePlan = {
  helpsWithSymptoms: string;
  labelUsagePlan: string;
  doNotExceed: string;
  avoidIf: string;
  interactionWarnings: string;
  seekCareTriggers: string;
  disclaimer: string;
};

const DISCLAIMER =
  'This tool provides label-based medication guidance only and is not a substitute for professional medical care.';

const EMERGENCY_SYMPTOMS = ['chest pain', 'severe breathing', 'severe breathing difficulty'];

function toText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function checkEmergency(input: SymptomInput): { ok: true } | { ok: false; error: string } {
  const text = [...(input.symptoms ?? []), input.otherMeds || '', input.otherSymptoms || ''].join(' ').toLowerCase();
  for (const s of EMERGENCY_SYMPTOMS) {
    if (text.includes(s)) {
      return {
        ok: false,
        error:
          'Chest pain or severe breathing difficulty require immediate medical attention. Do not rely on this tool. Call emergency services or go to the nearest emergency room.',
      };
    }
  }
  return { ok: true };
}

export function checkAge(input: SymptomInput, med: OTCMedication): { ok: true } | { ok: false; error: string } {
  const minAge = med.min_age_years ?? 0;
  if (typeof input.age === 'number' && input.age < minAge) {
    return { ok: false, error: `This product is not recommended for anyone under ${minAge} years. Please consult a healthcare provider.` };
  }
  return { ok: true };
}

export function checkDuplicateIngredient(input: SymptomInput, med: OTCMedication): { ok: true } | { ok: false; error: string } {
  const ingredient = (med.active_ingredient || '').toLowerCase();
  const other = (input.otherMeds || '').toLowerCase();
  if (ingredient && other.includes(ingredient) && !input.proceedDespiteInteraction) {
    return {
      ok: false,
      error: `Possible duplicate active ingredient detected (${ingredient}) in “other medications”. Confirm with a pharmacist/doctor before combining.`,
    };
  }
  return { ok: true };
}

export function labelOnlyPlan(med: OTCMedication, input: SymptomInput): UsagePlan {
  const helps =
    med.symptom_targets?.length && input.symptoms?.length
      ? `This medication may help with: ${med.symptom_targets.join(', ')}. (Compare to your symptoms: ${(input.symptoms || []).join(', ') || '—'})`
      : med.symptom_targets?.length
        ? `This medication may help with: ${med.symptom_targets.join(', ')}.`
        : 'Use label indications only.';
  return {
    helpsWithSymptoms: helps,
    labelUsagePlan: med.standard_label_dose || 'Follow the package directions.',
    doNotExceed: med.max_daily_dose || 'Do not exceed the package maximum.',
    avoidIf: (med.contraindications ?? []).join('; ') || 'See label contraindications.',
    interactionWarnings:
      'If you take other medicines or have chronic conditions, confirm safety with your pharmacist/doctor. Avoid duplicating active ingredients.',
    seekCareTriggers:
      'Seek medical care urgently for severe symptoms, allergic reaction, confusion, fainting, trouble breathing, or if symptoms persist/worsen.',
    disclaimer: DISCLAIMER,
  };
}

function buildSystemPrompt(): string {
  return `You are a cautious medication guidance assistant.
You ONLY use the structured medication label data provided and the user's symptom inputs.
You never invent doses. You never exceed label limits. You do not diagnose.

Return valid JSON with keys:
- helpsWithSymptoms
- labelUsagePlan
- doNotExceed
- avoidIf
- interactionWarnings
- seekCareTriggers
- disclaimer

Each value must be a single plain string (no nested objects/arrays).
Always include this disclaimer verbatim in disclaimer: "${DISCLAIMER}"`;
}

function buildUserMessage(med: OTCMedication, input: SymptomInput): string {
  return JSON.stringify(
    {
      medication: {
        name: med.name,
        active_ingredient: med.active_ingredient,
        strength: med.strength,
        standard_label_dose: med.standard_label_dose,
        max_daily_dose: med.max_daily_dose,
        symptom_targets: med.symptom_targets,
        contraindications: med.contraindications,
        min_age_years: med.min_age_years,
      },
      user: {
        symptoms: input.symptoms,
        severity: input.severity,
        age: input.age,
        other_medications: input.otherMeds || 'None reported',
        other_symptoms: input.otherSymptoms || '',
      },
      instructions:
        'Based only on the above, produce the JSON output. Never invent doses. Never exceed label limits. No diagnosis. No dosing beyond the provided label strings.',
    },
    null,
    2
  );
}

export async function generateOtcPlan(med: OTCMedication, input: SymptomInput): Promise<{ plan: UsagePlan; ai?: boolean; error?: string }> {
  if (!hasOpenAI() || !config.openai.apiKey) {
    return { plan: labelOnlyPlan(med, input), ai: false, error: 'OpenAI key not configured; using label-only fallback.' };
  }

  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: config.openai.apiKey });
  try {
    const resp = await client.chat.completions.create({
      model: config.openai.model || 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildUserMessage(med, input) },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 700,
    });

    const content = resp.choices[0]?.message?.content;
    if (!content) return { plan: labelOnlyPlan(med, input), ai: false, error: 'No model response; using label-only fallback.' };

    const parsed = JSON.parse(content) as Record<string, unknown>;
    const plan: UsagePlan = {
      helpsWithSymptoms: toText(parsed.helpsWithSymptoms),
      labelUsagePlan: toText(parsed.labelUsagePlan),
      doNotExceed: toText(parsed.doNotExceed),
      avoidIf: toText(parsed.avoidIf),
      interactionWarnings: toText(parsed.interactionWarnings),
      seekCareTriggers: toText(parsed.seekCareTriggers),
      disclaimer: toText(parsed.disclaimer) || DISCLAIMER,
    };
    return { plan, ai: true };
  } catch (e) {
    return { plan: labelOnlyPlan(med, input), ai: false, error: `Model error; using label-only fallback. ${String(e)}` };
  }
}

export function buildTavusPrompt(args: { medication: OTCMedication; input: SymptomInput; plan?: UsagePlan; emergencyMessage?: string }): string {
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

export { DISCLAIMER };


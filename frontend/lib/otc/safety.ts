import type { OTCMedication, SymptomInput } from './types';
import { EMERGENCY_SYMPTOMS } from './types';

const MIN_OCR_CONFIDENCE = 0.4;

export interface SafetyResult {
  ok: boolean;
  error?: string;
  code?: 'LOW_OCR' | 'AGE_BELOW_MIN' | 'DUPLICATE_INGREDIENT' | 'EMERGENCY';
}

export function checkAge(age: number, medication: OTCMedication): SafetyResult {
  const minAge = medication.min_age_years ?? 0;
  if (age < minAge) {
    return {
      ok: false,
      code: 'AGE_BELOW_MIN',
      error: `This product is not recommended for anyone under ${minAge} years. Please consult a healthcare provider.`,
    };
  }
  return { ok: true };
}

export function checkDuplicateIngredient(matchedMed: OTCMedication, otherMedsText: string): SafetyResult {
  const ingredient = matchedMed.active_ingredient.toLowerCase();
  const lower = (otherMedsText || '').toLowerCase();
  if (ingredient && lower.includes(ingredient)) {
    return {
      ok: false,
      code: 'DUPLICATE_INGREDIENT',
      error: `You may already be taking a product containing ${ingredient}. Do not duplicate active ingredients.`,
    };
  }
  return { ok: true };
}

export function checkEmergencySymptoms(input: Pick<SymptomInput, 'symptoms' | 'otherMeds' | 'otherSymptoms'>): SafetyResult {
  const text = [...(input.symptoms ?? []), input.otherMeds || '', input.otherSymptoms || ''].join(' ').toLowerCase();
  for (const symptom of EMERGENCY_SYMPTOMS) {
    if (text.includes(symptom)) {
      return {
        ok: false,
        code: 'EMERGENCY',
        error:
          'Chest pain or severe breathing difficulty require immediate medical attention. Do not rely on this tool. Call emergency services or go to the nearest emergency room.',
      };
    }
  }
  return { ok: true };
}

export function checkOCRConfidence(confidence: number): SafetyResult {
  if (confidence < MIN_OCR_CONFIDENCE) {
    return {
      ok: false,
      code: 'LOW_OCR',
      error: "We couldn't read the label clearly. Please rescan or enter the medication manually.",
    };
  }
  return { ok: true };
}

export { MIN_OCR_CONFIDENCE };


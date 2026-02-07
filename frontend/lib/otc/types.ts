export interface OTCMedication {
  id: string;
  name: string;
  active_ingredient: string;
  strength: string;
  standard_label_dose: string;
  max_daily_dose: string;
  symptom_targets: string[];
  contraindications: string[];
  min_age_years?: number;
  dose_interval_hours?: number;
  max_doses_per_day?: number;
  label_max_duration_days?: number;
  do_not_use_with?: string[];
}

export interface OCRExtract {
  medicationName?: string;
  ingredients?: string;
  dosage?: string;
  warnings?: string;
  rawText: string;
  confidence: number;
}

export interface MedicationMatch {
  medication: OTCMedication;
  confidence: number;
  matchedFields: string[];
}

export const SYMPTOM_OPTIONS = ['pain', 'fever', 'cough', 'congestion', 'sore throat', 'headache', 'nausea'] as const;
export type SymptomOption = (typeof SYMPTOM_OPTIONS)[number];

export const EMERGENCY_SYMPTOMS = ['chest pain', 'severe breathing', 'severe breathing difficulty'];

export interface SymptomInput {
  symptoms: SymptomOption[];
  severity: number; // 1-10
  age: number;
  otherMeds: string;
  otherSymptoms?: string;
  proceedDespiteInteraction?: boolean;
}

export interface UsagePlan {
  helpsWithSymptoms: string;
  labelUsagePlan: string;
  doNotExceed: string;
  avoidIf: string;
  interactionWarnings: string;
  seekCareTriggers: string;
  disclaimer: string;
}

export type OtcPlanResponse =
  | { success: true; emergency?: false; plan: UsagePlan; tavus_prompt: string }
  | { success: true; emergency: true; emergencyMessage: string; tavus_prompt: string }
  | { success: false; error: string };


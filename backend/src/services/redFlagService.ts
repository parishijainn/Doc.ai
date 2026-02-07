/**
 * Rules engine: detect emergency/red-flag symptoms before LLM.
 * If triggered: show emergency banner, recommend 911, disable routine advice.
 */

const RED_FLAG_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\b(chest\s+pain|chest\s+pressure|heart\s+attack)\b/i, label: 'chest_pain' },
  { pattern: /\b(can\'t\s+breathe|difficulty\s+breathing|shortness\s+of\s+breath|choking)\b/i, label: 'breathing_difficulty' },
  { pattern: /\b(stroke|facial\s+droop|slurred\s+speech|arm\s+weakness|arm\s+is\s+weak|speech\s+is\s+slurred|sudden\s+confusion)\b/i, label: 'stroke_symptoms' },
  { pattern: /\b(severe\s+bleeding|heavy\s+bleeding|bleeding\s+that\s+won\'t\s+stop)\b/i, label: 'severe_bleeding' },
  { pattern: /\b(head\s+injury|hit\s+my\s+head|head\s+trauma)\s+.*\b(confusion|dizzy|unconscious|vomiting)\b/i, label: 'head_injury_confusion' },
  { pattern: /\b(suicid(e|al)|want\s+to\s+die|kill\s+myself|end\s+my\s+life)\b/i, label: 'suicidal_ideation' },
  { pattern: /\b(severe\s+allergic\s+reaction|anaphylax(is|tic)|throat\s+closing|swelling\s+of\s+face)\b/i, label: 'severe_allergic_reaction' },
  { pattern: /\b(unconscious|passed\s+out|not\s+responding)\b/i, label: 'unresponsive' },
  { pattern: /\b(severe\s+burn|third\s+degree|chemical\s+burn)\b/i, label: 'severe_burn' },
  { pattern: /\b(seizure|convulsion)\b/i, label: 'seizure' },
  { pattern: /\b(poison(ed|ing)|overdose|swallowed\s+something)\b/i, label: 'poisoning_overdose' },
  { pattern: /\b(suicide|self[\s-]harm)\b/i, label: 'suicidal_ideation' },
];

const EMERGENCY_MESSAGE =
  'Based on what you described, this may be a medical emergency. Please call 911 (or your local emergency number) now. This tool cannot provide emergency care.';

export interface RedFlagCheckResult {
  triggered: boolean;
  labels: string[];
  emergencyMessage: string | null;
}

export function checkRedFlags(userText: string): RedFlagCheckResult {
  const labels: string[] = [];
  for (const { pattern, label } of RED_FLAG_PATTERNS) {
    if (pattern.test(userText)) {
      labels.push(label);
    }
  }
  return {
    triggered: labels.length > 0,
    labels,
    emergencyMessage: labels.length > 0 ? EMERGENCY_MESSAGE : null,
  };
}

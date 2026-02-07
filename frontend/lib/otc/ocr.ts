export interface NormalizedOCR {
  medicationName?: string;
  ingredients?: string;
  dosage?: string;
  warnings?: string;
  rawText: string;
  confidence: number;
}

function cleanLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

function guessMedicationName(lines: string[]): string | undefined {
  for (const line of lines) {
    const t = cleanLine(line);
    if (t.length < 3 || t.length > 80) continue;
    if (/^\d+/.test(t)) continue;
    if (/^(mg|mcg|ml|tablet|caplet)/i.test(t)) continue;
    return t;
  }
  return undefined;
}

function findIngredientsBlock(lines: string[]): string | undefined {
  const keywords = ['ingredient', 'active', 'contains', 'each'];
  let collecting = false;
  const parts: string[] = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (keywords.some((k) => lower.includes(k))) collecting = true;
    if (collecting) parts.push(cleanLine(line));
    if (collecting && parts.length >= 4) break;
  }
  return parts.length ? parts.join(' ') : undefined;
}

function findDosageBlock(lines: string[]): string | undefined {
  const keywords = ['dose', 'dosing', 'every', 'hours', 'mg', 'take', 'adults', 'children'];
  const parts: string[] = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (keywords.some((k) => lower.includes(k))) parts.push(cleanLine(line));
  }
  return parts.length ? parts.slice(0, 5).join(' ') : undefined;
}

function findWarningsBlock(lines: string[]): string | undefined {
  const keywords = ['warning', 'do not use', 'stop use', 'ask a doctor', 'allergy'];
  const parts: string[] = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (keywords.some((k) => lower.includes(k))) parts.push(cleanLine(line));
  }
  return parts.length ? parts.slice(0, 8).join(' ') : undefined;
}

export function normalizeOCROutput(lines: string[], overallConfidence: number): NormalizedOCR {
  const rawText = lines.map(cleanLine).filter(Boolean).join('\n');
  return {
    medicationName: guessMedicationName(lines),
    ingredients: findIngredientsBlock(lines),
    dosage: findDosageBlock(lines),
    warnings: findWarningsBlock(lines),
    rawText,
    confidence: overallConfidence,
  };
}


import Fuse from 'fuse.js';
import type { OCRExtract, OTCMedication } from './types';
import medications from './otc-medications.json';

const DB = medications as OTCMedication[];

function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface MatchResult {
  medication: OTCMedication;
  confidence: number;
  matchedFields: string[];
}

export function fuzzyMatchOCR(extract: OCRExtract): MatchResult[] {
  const searchText = normalize(
    [extract.medicationName || '', extract.ingredients || '', extract.dosage || '', extract.warnings || '', extract.rawText || ''].join(' ')
  );

  const fuse = new Fuse(DB, {
    includeScore: true,
    includeMatches: true,
    threshold: 0.42,
    ignoreLocation: true,
    minMatchCharLength: 3,
    keys: [
      { name: 'name', weight: 0.62 },
      { name: 'active_ingredient', weight: 0.28 },
      { name: 'strength', weight: 0.1 },
    ],
  });

  const results = fuse.search(searchText, { limit: 5 });
  return results.map((r) => {
    const score = typeof r.score === 'number' ? r.score : 1;
    const confidence = Math.max(0, Math.min(1, 1 - score));
    const matchedFields = Array.from(new Set((r.matches || []).map((m) => String(m.key))));
    return {
      medication: r.item,
      confidence: Math.round(confidence * 100) / 100,
      matchedFields,
    };
  });
}

export function getAllMedications(): OTCMedication[] {
  return DB;
}

export function getMedicationById(id: string): OTCMedication | undefined {
  return DB.find((m) => m.id === id);
}


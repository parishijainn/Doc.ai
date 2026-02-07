import { getNearbyPlaces, type CareMapPlace, type CareMapPlaceType } from './osmService.js';
import { getRouteSummary } from './osrmDetailedService.js';
import { capacityScore, getHospitalSeedByName } from '../store/capacityTable.js';

export type PatientNeeds = {
  complaint?: string;
  severity?: 'routine' | 'soon' | 'emergency';
  flags?: string[];
  requiredSpecialties?: string[];
};

export type RankedPlace = CareMapPlace & {
  distanceMeters?: number;
  etaSeconds?: number;
  score: number;
  specialtyMatchScore: number;
  capacityScore: number;
};

function uniqLower(xs: string[]): string[] {
  return Array.from(
    new Set(
      xs
        .map((x) => (x ?? '').toString().trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function specialtyMatch(required: string[], placeSpecialties?: string[]): number {
  const req = uniqLower(required);
  if (!req.length) return 0.5; // neutral if unknown
  const have = new Set(uniqLower(placeSpecialties ?? []));
  if (!have.size) return 0.2;
  let hits = 0;
  for (const r of req) if (have.has(r)) hits++;
  return hits / req.length;
}

function scorePlace(args: {
  specialtyMatchScore: number;
  capacityScore: number;
  etaSeconds?: number;
  distanceMeters?: number;
}): number {
  const specialtyMatchWeight = 0.45;
  const capacityWeight = 0.30;
  const etaWeight = 0.20;
  const distanceWeight = 0.05;

  const eta = (args.etaSeconds ?? 99999) + 1;
  const dist = (args.distanceMeters ?? 9e9) + 1;

  const etaScore = 1 / eta;
  const distScore = 1 / dist;

  return (
    specialtyMatchWeight * args.specialtyMatchScore +
    capacityWeight * args.capacityScore +
    etaWeight * etaScore +
    distanceWeight * distScore
  );
}

export async function rankAndRecommend(args: {
  lat: number;
  lng: number;
  radiusM: number;
  types: CareMapPlaceType[];
  patientNeeds: PatientNeeds;
}): Promise<{ recommendedPlace: RankedPlace | null; rankedPlaces: RankedPlace[]; reasoning: string[] }> {
  const { lat, lng, radiusM } = args;
  const needs = args.patientNeeds ?? {};
  const required = uniqLower(needs.requiredSpecialties ?? []);
  const severity = needs.severity ?? 'routine';
  const flags = uniqLower(needs.flags ?? []);
  const emergency = severity === 'emergency' || flags.includes('emergency');

  const types = args.types.length ? args.types : (['hospital', 'urgent_care', 'primary_care', 'specialist', 'pharmacy'] as CareMapPlaceType[]);
  const places = await getNearbyPlaces(lat, lng, radiusM, types);

  // Enrich hospitals with seeded capacity + specialties, if we can.
  for (const p of places) {
    if (p.type === 'hospital') {
      const seed = getHospitalSeedByName(p.name);
      if (seed) {
        p.capacity = seed.capacity;
        p.specialties = uniqLower([...(p.specialties ?? []), ...seed.specialties]);
        p.website = p.website ?? seed.website;
        p.phone = p.phone ?? seed.phone;
      }
    }
  }

  // Compute ETA/distance for a limited number of candidates (keep public OSRM happy).
  const candidates = places
    .filter((p) => (emergency ? p.type === 'hospital' : true))
    .slice(0, 25);

  const enriched: Array<CareMapPlace & { distanceMeters?: number; etaSeconds?: number }> = [];
  for (const p of candidates) {
    const r = await getRouteSummary(lat, lng, p.lat, p.lng, 'driving').catch(() => ({ distanceMeters: undefined, durationSeconds: undefined } as any));
    enriched.push({
      ...p,
      distanceMeters: typeof r?.distanceMeters === 'number' ? r.distanceMeters : undefined,
      etaSeconds: typeof r?.durationSeconds === 'number' ? r.durationSeconds : undefined,
    });
  }

  const ranked: RankedPlace[] = enriched.map((p) => {
    const cap =
      p.type === 'hospital' && p.capacity
        ? capacityScore(p.capacity.status, p.capacity.acceptingPatients)
        : 0.5;
    const sm = specialtyMatch(required, p.specialties);
    const s = scorePlace({ specialtyMatchScore: sm, capacityScore: cap, etaSeconds: p.etaSeconds, distanceMeters: p.distanceMeters });
    return {
      ...p,
      score: s,
      specialtyMatchScore: sm,
      capacityScore: cap,
    };
  });

  ranked.sort((a, b) => b.score - a.score);

  // Emergency override: nearest accepting ER-ish hospital if possible.
  let recommended: RankedPlace | null = ranked[0] ?? null;
  if (emergency) {
    const hospitals = ranked.filter((p) => p.type === 'hospital');
    const accepting = hospitals.filter((h) => (h.capacity ? h.capacity.acceptingPatients && h.capacity.status !== 'red' : true));
    const byEta = (xs: RankedPlace[]) =>
      xs.slice().sort((a, b) => (a.etaSeconds ?? 9e9) - (b.etaSeconds ?? 9e9));
    recommended = byEta(accepting)[0] ?? byEta(hospitals)[0] ?? ranked[0] ?? null;
  }

  const reasoning: string[] = [];
  if (recommended) {
    const best = recommended;
    if (emergency) reasoning.push('Emergency override: routing to an ER/hospital first.');
    if ((best.etaSeconds ?? 0) > 0) reasoning.push(`Short travel time (ETA ~${Math.round((best.etaSeconds ?? 0) / 60)} min).`);
    if (required.length) {
      const have = uniqLower(best.specialties ?? []);
      const hits = required.filter((r) => have.includes(r));
      if (hits.length) reasoning.push(`Specialty match: ${hits.join(', ')}.`);
      else reasoning.push('Limited specialty match found nearby; consider calling ahead.');
    }
    if (best.capacity) {
      reasoning.push(
        `Capacity: ${best.capacity.status.toUpperCase()} (${best.capacity.acceptingPatients ? 'accepting' : 'not accepting'}).`
      );
    } else if (best.type === 'hospital') {
      reasoning.push('Capacity data not available for this hospital (demo table not matched).');
    }
  }

  return {
    recommendedPlace: recommended,
    rankedPlaces: ranked,
    reasoning,
  };
}


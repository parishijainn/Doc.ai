import { config } from '../config.js';

export type RouteStep = {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
};

export type DetailedRoute = {
  geometry: any; // GeoJSON LineString
  distanceMeters: number;
  durationSeconds: number;
  steps: RouteStep[];
  /** True when OSRM was unavailable and we returned an approximate route. */
  fallback?: boolean;
  note?: string;
};

type CacheEntry<T> = { at: number; value: T };

const SUMMARY_TTL_MS = 30_000;
const DETAILED_TTL_MS = 2 * 60_000;
const summaryCache = new Map<string, CacheEntry<{ distanceMeters: number; durationSeconds: number }>>();
const detailedCache = new Map<string, CacheEntry<DetailedRoute>>();

function osrmBase(): string {
  // config.osrm.baseUrl is currently like "http://router.project-osrm.org/route/v1"
  return (config.osrm.baseUrl ?? 'http://router.project-osrm.org/route/v1').replace(/\/$/, '');
}

function profile(mode: 'driving' | 'walking'): string {
  return mode === 'walking' ? 'walking' : 'driving';
}

function safeNumber(x: any, fallback: number): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : fallback;
}

function stepInstruction(step: any): string {
  const m = step?.maneuver;
  const type = (m?.type ?? '').toString();
  const mod = (m?.modifier ?? '').toString();
  const name = (step?.name ?? '').toString();
  const parts = [type, mod].filter(Boolean).join(' ');
  const to = name ? ` onto ${name}` : '';
  const text = (parts || 'Continue') + to;
  return text.replace(/\s+/g, ' ').trim();
}

function keyFor(mode: 'driving' | 'walking', fromLat: number, fromLng: number, toLat: number, toLng: number): string {
  const r = (n: number) => Math.round(n * 1e5) / 1e5; // ~1m precision
  return `${mode}:${r(fromLat)},${r(fromLng)}->${r(toLat)},${r(toLng)}`;
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<{ ok: boolean; status: number; data: any }> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

export async function getDetailedRoute(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  mode: 'driving' | 'walking' = 'driving'
): Promise<DetailedRoute> {
  const k = keyFor(mode, fromLat, fromLng, toLat, toLng);
  const cached = detailedCache.get(k);
  if (cached && Date.now() - cached.at < DETAILED_TTL_MS) return cached.value;

  const base = osrmBase();
  const url =
    `${base}/${profile(mode)}/${fromLng},${fromLat};${toLng},${toLat}` +
    `?overview=full&geometries=geojson&steps=true`;

  try {
    const { ok, status, data } = await fetchJsonWithTimeout(url, 12_000);
    if (!ok || data?.code !== 'Ok' || !data?.routes?.[0]) {
      throw new Error(`OSRM route failed: ${status} ${JSON.stringify(data)}`);
    }
    const route = data.routes[0];
    const leg = route.legs?.[0];
    const rawSteps = Array.isArray(leg?.steps) ? leg.steps : [];

    const steps: RouteStep[] = rawSteps.map((s: any) => ({
      instruction: stepInstruction(s),
      distanceMeters: safeNumber(s?.distance, 0),
      durationSeconds: safeNumber(s?.duration, 0),
    }));

    const out: DetailedRoute = {
      geometry: route.geometry,
      distanceMeters: safeNumber(route.distance, 0),
      durationSeconds: safeNumber(route.duration, 0),
      steps,
      fallback: false,
    };
    detailedCache.set(k, { at: Date.now(), value: out });
    return out;
  } catch (e) {
    // Approx fallback so UI still draws *something* if public OSRM is down/blocked.
    const km = haversineKm(fromLat, fromLng, toLat, toLng);
    const speedKmh = mode === 'walking' ? 5 : 50;
    const secs = (km / speedKmh) * 3600;
    const geometry = {
      type: 'LineString',
      coordinates: [
        [fromLng, fromLat],
        [toLng, toLat],
      ],
    };
    const out: DetailedRoute = {
      geometry,
      distanceMeters: Math.round(km * 1000),
      durationSeconds: Math.max(60, Math.round(secs)),
      steps: [
        {
          instruction: 'Head toward the destination (approximate route—routing server unavailable).',
          distanceMeters: Math.round(km * 1000),
          durationSeconds: Math.max(60, Math.round(secs)),
        },
      ],
      fallback: true,
      note: `OSRM unavailable: ${String(e)}`,
    };
    detailedCache.set(k, { at: Date.now(), value: out });
    return out;
  }
}

export async function getRouteSummary(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  mode: 'driving' | 'walking' = 'driving'
): Promise<{ distanceMeters: number; durationSeconds: number }> {
  const k = keyFor(mode, fromLat, fromLng, toLat, toLng);
  const cached = summaryCache.get(k);
  if (cached && Date.now() - cached.at < SUMMARY_TTL_MS) return cached.value;

  const base = osrmBase();
  const url = `${base}/${profile(mode)}/${fromLng},${fromLat};${toLng},${toLat}?overview=false`;
  const { ok, status, data } = await fetchJsonWithTimeout(url, 8_000);
  if (!ok || data?.code !== 'Ok' || !data?.routes?.[0]) {
    // Fallback: rough estimate (50km/h driving, 5km/h walking)
    const km = haversineKm(fromLat, fromLng, toLat, toLng);
    const speedKmh = mode === 'walking' ? 5 : 50;
    const secs = (km / speedKmh) * 3600;
    const fallback = { distanceMeters: Math.round(km * 1000), durationSeconds: Math.round(secs) };
    summaryCache.set(k, { at: Date.now(), value: fallback });
    return fallback;
  }
  const route = data.routes[0];
  const out = {
    distanceMeters: safeNumber(route.distance, 0),
    durationSeconds: safeNumber(route.duration, 0),
  };
  summaryCache.set(k, { at: Date.now(), value: out });
  return out;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}


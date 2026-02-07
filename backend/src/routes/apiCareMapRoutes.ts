import { Router } from 'express';
import { getNearbyPlaces, type CareMapPlaceType } from '../services/osmService.js';
import { getDetailedRoute, getRouteSummary } from '../services/osrmDetailedService.js';
import { getHospitalSeedByName } from '../store/capacityTable.js';
import { rankAndRecommend } from '../services/careRoutingService.js';

const router = Router();

function parseTypes(raw: string | undefined): CareMapPlaceType[] {
  const allowed: CareMapPlaceType[] = ['hospital', 'urgent_care', 'primary_care', 'specialist', 'pharmacy', 'transit'];
  if (!raw) return allowed;
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as CareMapPlaceType[];
  return parts.filter((p) => allowed.includes(p));
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1000;
}

/**
 * GET /api/geo/geocode?q=
 * OpenStreetMap Nominatim geocoding (no keys).
 * Returns { lat, lng, displayName } or 404.
 */
router.get('/api/geo/geocode', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) return res.status(400).json({ error: 'q required' });
  const country = String(req.query.country ?? 'us').trim().toLowerCase();
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1` +
      `&countrycodes=${encodeURIComponent(country || 'us')}` +
      `&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'CareZoom/1.0 (care map MVP)',
        Accept: 'application/json',
      },
    });
    const data = (await r.json().catch(() => [])) as any[];
    const top = data?.[0];
    if (!top?.lat || !top?.lon) return res.status(404).json({ error: 'not_found' });
    return res.json({
      lat: parseFloat(top.lat),
      lng: parseFloat(top.lon),
      displayName: String(top.display_name ?? q),
    });
  } catch (e) {
    return res.status(200).json({ error: 'geocode_failed', details: String(e) });
  }
});

/**
 * GET /api/geo/nearby?lat=&lng=&radiusM=&types=hospital,urgent_care,pharmacy,...
 * OpenStreetMap Overpass only (no keys).
 */
router.get('/api/geo/nearby', async (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  const radiusM = parseInt((req.query.radiusM as string) || '8000', 10);
  const types = parseTypes(req.query.types as string | undefined);

  if ([lat, lng].some(Number.isNaN)) return res.status(400).json({ error: 'lat and lng required' });

  try {
    const places = await getNearbyPlaces(lat, lng, radiusM, types);

    // Attach seeded capacity/specialties when possible (hospitals).
    for (const p of places) {
      if (p.type === 'hospital') {
        const seed = getHospitalSeedByName(p.name);
        if (seed) {
          p.capacity = seed.capacity;
          p.specialties = Array.from(new Set([...(p.specialties ?? []), ...seed.specialties]));
          p.website = p.website ?? seed.website;
          p.phone = p.phone ?? seed.phone;
        }
      }
    }

    // Add distance + ETA (limit OSRM calls; fall back to haversine).
    const sortedByDist = places
      .map((p) => ({ p, d: haversineMeters(lat, lng, p.lat, p.lng) }))
      .sort((a, b) => a.d - b.d);

    // OSRM calls are expensive (and can be slow). We cap ETA calculations to a few nearest results.
    const maxEta = 6;
    const withEta: any[] = [];
    const etaFor = async (p: any) => getRouteSummary(lat, lng, p.lat, p.lng, 'driving').catch(() => null);
    const etaResults = await Promise.all(sortedByDist.slice(0, maxEta).map((x) => etaFor(x.p)));
    for (let i = 0; i < sortedByDist.length; i++) {
      const { p, d } = sortedByDist[i];
      const eta = i < maxEta ? etaResults[i] : null;
      withEta.push({
        ...p,
        distanceMeters: eta?.distanceMeters ?? Math.round(d),
        etaSeconds: eta?.durationSeconds,
      });
    }

    return res.json({ places: withEta });
  } catch (e) {
    return res.status(200).json({ places: [], error: String(e) });
  }
});

/**
 * GET /api/geo/route?fromLat=&fromLng=&toLat=&toLng=&mode=driving|walking
 * OSRM turn-by-turn + polyline geometry.
 */
router.get('/api/geo/route', async (req, res) => {
  const fromLat = parseFloat(req.query.fromLat as string);
  const fromLng = parseFloat(req.query.fromLng as string);
  const toLat = parseFloat(req.query.toLat as string);
  const toLng = parseFloat(req.query.toLng as string);
  const mode = ((req.query.mode as string) === 'walking' ? 'walking' : 'driving') as 'driving' | 'walking';

  if ([fromLat, fromLng, toLat, toLng].some(Number.isNaN)) {
    return res.status(400).json({ error: 'fromLat, fromLng, toLat, toLng required' });
  }
  try {
    const r = await getDetailedRoute(fromLat, fromLng, toLat, toLng, mode);
    return res.json({
      geometry: r.geometry,
      distanceMeters: r.distanceMeters,
      durationSeconds: r.durationSeconds,
      steps: r.steps,
      mode,
      fallback: Boolean(r.fallback),
      note: r.note,
    });
  } catch (e) {
    return res.status(200).json({ error: 'route_failed', details: String(e) });
  }
});

/**
 * POST /api/geo/recommend
 * Body: { lat, lng, radiusM, patientNeeds: { complaint, severity, flags[], requiredSpecialties[] } }
 */
router.post('/api/geo/recommend', async (req, res) => {
  const lat = parseFloat(req.body?.lat);
  const lng = parseFloat(req.body?.lng);
  const radiusM = parseInt(req.body?.radiusM ?? '8000', 10);
  const patientNeeds = (req.body?.patientNeeds ?? {}) as any;

  if ([lat, lng].some(Number.isNaN)) return res.status(400).json({ error: 'lat and lng required' });

  try {
    const out = await rankAndRecommend({
      lat,
      lng,
      radiusM,
      types: ['hospital', 'urgent_care', 'primary_care', 'specialist', 'pharmacy'],
      patientNeeds,
    });
    return res.json(out);
  } catch (e) {
    return res.status(200).json({ recommendedPlace: null, rankedPlaces: [], reasoning: [], error: String(e) });
  }
});

export default router;


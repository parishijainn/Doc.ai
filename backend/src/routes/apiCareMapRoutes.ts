import { Router } from 'express';
import { getNearbyPlaces, type CareMapPlaceType } from '../services/osmService.js';
import { getDetailedRoute } from '../services/osrmDetailedService.js';
import { rankAndRecommend } from '../services/careRoutingService.js';

const router = Router();

function parseTypes(raw: string | undefined): CareMapPlaceType[] {
  const s = (raw ?? '').trim();
  if (!s) return ['hospital', 'urgent_care', 'primary_care', 'specialist', 'pharmacy'];
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x): x is CareMapPlaceType =>
      ['hospital', 'urgent_care', 'primary_care', 'specialist', 'pharmacy'].includes(x)
    );
}

/**
 * GET /api/geo/geocode?q=
 * Best-effort geocode using OpenStreetMap Nominatim (no key).
 */
router.get('/api/geo/geocode', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const country = String(req.query.country ?? '').trim();
  if (!q) return res.status(400).json({ error: 'q required' });
  const url =
    `https://nominatim.openstreetmap.org/search?format=json&limit=5` +
    `&q=${encodeURIComponent(q)}` +
    (country ? `&countrycodes=${encodeURIComponent(country)}` : '');
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'CareZoom MVP (local demo)' } });
    const data = (await r.json().catch(() => [])) as any[];
    const results = (Array.isArray(data) ? data : []).map((x) => ({
      name: x.display_name,
      lat: Number(x.lat),
      lng: Number(x.lon),
    }));
    return res.json({ results });
  } catch (e) {
    return res.json({ results: [], error: String(e) });
  }
});

/**
 * GET /api/geo/nearby?lat=&lng=&radiusM=&types=comma,separated
 */
router.get('/api/geo/nearby', async (req, res) => {
  const lat = parseFloat(String(req.query.lat ?? ''));
  const lng = parseFloat(String(req.query.lng ?? ''));
  const radiusM = parseInt(String(req.query.radiusM ?? '8000'), 10);
  const types = parseTypes(String(req.query.types ?? ''));
  if ([lat, lng].some(Number.isNaN)) return res.status(400).json({ error: 'lat and lng required' });
  const places = await getNearbyPlaces(lat, lng, Number.isFinite(radiusM) ? radiusM : 8000, types);
  return res.json({ places });
});

/**
 * POST /api/geo/recommend
 * { lat, lng, radiusM, patientNeeds }
 */
router.post('/api/geo/recommend', async (req, res) => {
  const { lat, lng, radiusM, patientNeeds } = req.body ?? {};
  const la = typeof lat === 'number' ? lat : Number(lat);
  const ln = typeof lng === 'number' ? lng : Number(lng);
  const r = typeof radiusM === 'number' ? radiusM : Number(radiusM ?? 8000);
  if ([la, ln].some((x) => Number.isNaN(x))) return res.status(400).json({ error: 'lat and lng required' });
  const out = await rankAndRecommend({
    lat: la,
    lng: ln,
    radiusM: Number.isFinite(r) ? r : 8000,
    types: ['hospital', 'urgent_care', 'primary_care', 'specialist', 'pharmacy'],
    patientNeeds: patientNeeds ?? {},
  });
  return res.json(out);
});

/**
 * GET /api/geo/route?fromLat=&fromLng=&toLat=&toLng=&mode=driving|walking
 */
router.get('/api/geo/route', async (req, res) => {
  const fromLat = parseFloat(String(req.query.fromLat ?? ''));
  const fromLng = parseFloat(String(req.query.fromLng ?? ''));
  const toLat = parseFloat(String(req.query.toLat ?? ''));
  const toLng = parseFloat(String(req.query.toLng ?? ''));
  const mode = String(req.query.mode ?? 'driving') === 'walking' ? 'walking' : 'driving';
  if ([fromLat, fromLng, toLat, toLng].some(Number.isNaN)) {
    return res.status(400).json({ error: 'fromLat, fromLng, toLat, toLng required' });
  }
  const route = await getDetailedRoute(fromLat, fromLng, toLat, toLng, mode);
  return res.json(route);
});

/**
 * POST /api/geo/transit/plan
 * MVP: no schedule integration; return graceful "not available".
 */
router.post('/api/geo/transit/plan', async (_req, res) => {
  return res.json({
    available: false,
    note: 'Public transit planning is not integrated in this MVP (demo only).',
    segments: [],
  });
});

export default router;


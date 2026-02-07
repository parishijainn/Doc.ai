import { Router } from 'express';
import { getRoute } from '../services/mapsService.js';

const router = Router();

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

/**
 * GET /api/nearby-care?lat=&lng=&type=hospital|doctor|urgent_care|dermatologist
 * Uses OpenStreetMap Overpass by default (no key required).
 */
router.get('/api/nearby-care', async (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  const type = (req.query.type as string) || 'hospital';
  const radius = parseInt((req.query.radius as string) || '10000', 10);

  if (Number.isNaN(lat) || Number.isNaN(lng)) return res.status(400).json({ error: 'lat and lng required' });

  const overpassTypeMap: Record<string, string[]> = {
    hospital: ['amenity=hospital', 'amenity=clinic'],
    urgent_care: ['amenity=clinic', 'healthcare=urgent_care'],
    doctor: ['amenity=doctors', 'healthcare=doctor'],
    dermatologist: ['healthcare=specialist', 'healthcare:speciality=dermatology'],
  };
  const filters = overpassTypeMap[type] ?? overpassTypeMap.hospital;

  const orParts = filters.map((f) => `nwr[${f}](around:${radius},${lat},${lng});`).join('\n');
  const query = `[out:json][timeout:15];
(
${orParts}
);
out center tags;`;

  try {
    const overpassUrl = 'https://overpass-api.de/api/interpreter';
    const r = await fetch(overpassUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });
    const data = await r.json();
    const elements = data.elements ?? [];

    const results = elements
      .map((el: any) => {
        const cLat = el.lat ?? el.center?.lat;
        const cLng = el.lon ?? el.center?.lon;
        const tags = el.tags ?? {};
        const name = tags.name ?? 'Care option';
        const phone = tags.phone ?? tags['contact:phone'] ?? undefined;
        const addressParts = [
          tags['addr:housenumber'],
          tags['addr:street'],
          tags['addr:city'],
          tags['addr:state'],
          tags['addr:postcode'],
        ].filter(Boolean);
        const address = addressParts.join(' ') || tags['addr:full'] || '';
        const distance = (cLat && cLng) ? haversineKm(lat, lng, cLat, cLng) : undefined;
        return {
          name,
          address,
          phone,
          distance_km: distance,
          rating: undefined,
          coordinates: { lat: cLat, lng: cLng },
        };
      })
      .filter((x: any) => x.coordinates.lat && x.coordinates.lng)
      .sort((a: any, b: any) => (a.distance_km ?? 999) - (b.distance_km ?? 999))
      .slice(0, 10);

    return res.json({ type, results });
  } catch (e) {
    return res.status(200).json({
      type,
      results: [],
      note: 'Overpass lookup failed; try again or configure a Places provider.',
      error: String(e),
    });
  }
});

/**
 * GET /api/route?fromLat=&fromLng=&toLat=&toLng=&mode=driving|walking
 */
router.get('/api/route', async (req, res) => {
  const fromLat = parseFloat(req.query.fromLat as string);
  const fromLng = parseFloat(req.query.fromLng as string);
  const toLat = parseFloat(req.query.toLat as string);
  const toLng = parseFloat(req.query.toLng as string);
  const mode = ((req.query.mode as string) === 'walking' ? 'walking' : 'driving') as 'driving' | 'walking';
  if ([fromLat, fromLng, toLat, toLng].some(Number.isNaN)) {
    return res.status(400).json({ error: 'fromLat, fromLng, toLat, toLng required' });
  }
  const route = await getRoute(fromLat, fromLng, toLat, toLng, mode);
  return res.json({
    distance_km: route.distanceKm,
    duration_minutes: route.durationMinutes,
    eta_minutes: route.durationMinutes,
    mode: route.mode,
  });
});

/**
 * GET /api/transport/options?toLat=&toLng=
 * (Frontend supplies current location; or uses pickup=my_location deep links.)
 */
router.get('/api/transport/options', async (req, res) => {
  const toLat = parseFloat(req.query.toLat as string);
  const toLng = parseFloat(req.query.toLng as string);
  if ([toLat, toLng].some(Number.isNaN)) return res.status(400).json({ error: 'toLat and toLng required' });

  const uber = `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=${toLat}&dropoff[longitude]=${toLng}`;
  return res.json({
    uber_deeplink: uber,
    public_transport: {
      available: false,
      note: 'Public transit routing is not integrated in this MVP.',
    },
    walking: { available: true },
    driving: { available: true },
  });
});

export default router;


import { Router } from 'express';
import { getNearbyProviders, getRoute } from '../services/mapsService.js';

const router = Router();

router.get('/care/nearby', async (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  const type = req.query.type as string | undefined;
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ error: 'lat and lng required' });
  }
  const providers = await getNearbyProviders(lat, lng, type);
  res.json({ providers });
});

router.get('/route', async (req, res) => {
  const from = req.query.from as string; // "lat,lng"
  const to = req.query.to as string;
  const mode = ((req.query.mode as string) === 'walking' ? 'walking' : 'driving') as 'driving' | 'walking';
  if (!from || !to) return res.status(400).json({ error: 'from and to required (lat,lng)' });
  const [fromLat, fromLng] = from.split(',').map(Number);
  const [toLat, toLng] = to.split(',').map(Number);
  if ([fromLat, fromLng, toLat, toLng].some(Number.isNaN)) {
    return res.status(400).json({ error: 'from and to must be lat,lng numbers' });
  }
  const route = await getRoute(fromLat, fromLng, toLat, toLng, mode);
  res.json(route);
});

export default router;

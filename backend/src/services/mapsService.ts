import { config, hasMaps } from '../config.js';
import type { ProviderResult, RouteResult } from '../types.js';

const MOCK_PROVIDERS: ProviderResult[] = [
  { name: 'City Urgent Care', type: 'urgent_care', address: '123 Main St', lat: 40.44, lng: -79.94, distanceKm: 1.2, phone: '+1-412-555-0100', openNow: true },
  { name: 'General Hospital ER', type: 'er', address: '456 Hospital Dr', lat: 40.45, lng: -79.95, distanceKm: 2.5, phone: '+1-412-555-0200', openNow: true },
  { name: 'Skin & Wellness Dermatology', type: 'dermatology', address: '789 Oak Ave', lat: 40.43, lng: -79.93, distanceKm: 0.8, phone: '+1-412-555-0300' },
  { name: 'Community PT', type: 'pt', address: '321 Rehab Rd', lat: 40.46, lng: -79.96, distanceKm: 3.0, phone: '+1-412-555-0400' },
];

export async function getNearbyProviders(
  lat: number,
  lng: number,
  type?: string
): Promise<ProviderResult[]> {
  if (!hasMaps()) {
    return MOCK_PROVIDERS.filter((p) => !type || p.type === type).map((p) => ({
      ...p,
      distanceKm: haversineKm(lat, lng, p.lat, p.lng),
      travelTimeMinutes: Math.round((haversineKm(lat, lng, p.lat, p.lng) / 0.5) * 60),
    }));
  }
  // Real: use Mapbox Geocoding / Search API for POIs (hospital, urgent_care, etc.)
  const token = config.maps.mapboxToken;
  const typeMap: Record<string, string> = {
    urgent_care: 'urgent care',
    er: 'emergency room',
    hospital: 'hospital',
    dermatology: 'dermatologist',
    orthopedics: 'orthopedics',
    pt: 'physical therapy',
    pcp: 'primary care',
  };
  const query = type ? typeMap[type] ?? type : 'health';
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?proximity=${lng},${lat}&access_token=${token}&limit=5`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const features = data.features ?? [];
    return features.slice(0, 5).map((f: { place_name: string; center: number[]; context?: { text: string }[] }) => ({
      name: f.place_name.split(',')[0] ?? 'Provider',
      type: type ?? 'provider',
      address: f.place_name,
      lng: f.center[0],
      lat: f.center[1],
      distanceKm: 0,
      travelTimeMinutes: undefined,
    }));
  } catch {
    return MOCK_PROVIDERS.filter((p) => !type || p.type === type).map((p) => ({
      ...p,
      distanceKm: haversineKm(lat, lng, p.lat, p.lng),
      travelTimeMinutes: Math.round((haversineKm(lat, lng, p.lat, p.lng) / 0.5) * 60),
    }));
  }
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

export async function getRoute(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  mode: 'driving' | 'walking' = 'driving'
): Promise<RouteResult> {
  const base = config.osrm.baseUrl.replace(/\/$/, '');
  const profile = mode === 'walking' ? 'foot' : 'car';
  const url = `${base}/${profile}/${fromLng},${fromLat};${toLng},${toLat}?overview=full`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.[0]) {
      return mockRoute(fromLat, fromLng, toLat, toLng, mode);
    }
    const route = data.routes[0];
    const distanceKm = route.distance / 1000;
    const durationMinutes = route.duration / 60;
    const geometry = route.geometry?.coordinates ?? [];
    return {
      from: { lat: fromLat, lng: fromLng },
      to: { lat: toLat, lng: toLng },
      distanceKm,
      durationMinutes,
      geometry,
      mode,
    };
  } catch {
    return mockRoute(fromLat, fromLng, toLat, toLng, mode);
  }
}

function mockRoute(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  mode: 'driving' | 'walking'
): RouteResult {
  const km = haversineKm(fromLat, fromLng, toLat, toLng);
  const durationMinutes = mode === 'walking' ? km * 15 : km * 2;
  return {
    from: { lat: fromLat, lng: fromLng },
    to: { lat: toLat, lng: toLng },
    distanceKm: Math.round(km * 100) / 100,
    durationMinutes: Math.round(durationMinutes),
    mode,
  };
}

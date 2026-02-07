'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const API = (process.env.NEXT_PUBLIC_API_URL ?? '').trim() || 'http://localhost:4000';
const DEFAULT_CENTER = { lat: 40.444, lng: -79.945 }; // fallback so the map is always visible

type Capacity = {
  status: 'green' | 'yellow' | 'red';
  bedsOpen: number;
  acceptingPatients: boolean;
  updatedAt: string;
};

type Place = {
  id: string;
  name: string;
  type: 'hospital' | 'urgent_care' | 'primary_care' | 'specialist' | 'pharmacy' | 'transit';
  lat: number;
  lng: number;
  address: string;
  phone?: string;
  website?: string;
  specialties?: string[];
  capacity?: Capacity;
  etaSeconds?: number;
  distanceMeters?: number;
};

type RouteResp = {
  geometry: { type: 'LineString'; coordinates: number[][] };
  distanceMeters: number;
  durationSeconds: number;
  steps: { instruction: string; distanceMeters: number; durationSeconds: number }[];
  mode: 'driving' | 'walking';
  fallback?: boolean;
  note?: string;
};

type TransitStop = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: 'bus' | 'rail' | 'subway' | 'tram';
  operator?: string;
  lineHints?: string[];
};

type TransitPlanResp = {
  fromStops: TransitStop[];
  toStops: TransitStop[];
  suggested: {
    startStop?: TransitStop;
    endStop?: TransitStop;
    walkToStart?: { distanceMeters: number; durationSeconds: number; geometry: any };
    walkFromEnd?: { distanceMeters: number; durationSeconds: number; geometry: any };
    note: string;
  };
  error?: string;
};

type RouteMode = 'drive' | 'walk' | 'transit' | 'rideshare';

function milesToMeters(mi: number): number {
  return Math.round(mi * 1609.34);
}

function metersToMiles(m: number): number {
  return m / 1609.34;
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

function fmtMi(m?: number): string {
  if (typeof m !== 'number') return '—';
  const mi = metersToMiles(m);
  return mi < 0.1 ? '<0.1 mi' : `${mi.toFixed(1)} mi`;
}

function fmtMin(s?: number): string {
  if (typeof s !== 'number') return '—';
  const min = Math.max(1, Math.round(s / 60));
  return `${min} min`;
}

function typeLabel(t: Place['type']): string {
  switch (t) {
    case 'hospital':
      return 'Hospital / ER';
    case 'urgent_care':
      return 'Urgent care';
    case 'primary_care':
      return 'Primary care';
    case 'specialist':
      return 'Specialist';
    case 'pharmacy':
      return 'Pharmacy';
    case 'transit':
      return 'Transit stop';
  }
}

function markerColor(p: Place): string {
  if (p.type === 'hospital') {
    if (p.capacity?.status === 'green') return '#16a34a';
    if (p.capacity?.status === 'yellow') return '#ca8a04';
    if (p.capacity?.status === 'red') return '#dc2626';
    return '#ef4444';
  }
  if (p.type === 'urgent_care') return '#f97316';
  if (p.type === 'specialist') return '#7c3aed';
  if (p.type === 'primary_care') return '#0ea5e9';
  if (p.type === 'pharmacy') return '#2563eb';
  return '#64748b';
}

function capBadgeClasses(status?: Capacity['status']): string {
  if (status === 'green') return 'bg-green-100 text-green-900 border-green-300';
  if (status === 'yellow') return 'bg-yellow-100 text-yellow-900 border-yellow-300';
  if (status === 'red') return 'bg-red-100 text-red-900 border-red-300';
  return 'bg-slate-100 text-slate-800 border-slate-300';
}

function shortSpecialty(s: string): string {
  const x = s.toLowerCase();
  if (x.includes('derm')) return 'Derm';
  if (x.includes('ortho')) return 'Ortho';
  if (x.includes('cardio')) return 'Cardio';
  if (x.includes('pulmo')) return 'Pulm';
  if (x.includes('neuro')) return 'Neuro';
  if (x.includes('gastro')) return 'GI';
  if (x.includes('emergency')) return 'ER';
  return s.slice(0, 10);
}

function modeLabel(m: RouteMode): string {
  if (m === 'drive') return 'Drive';
  if (m === 'walk') return 'Walk';
  if (m === 'transit') return 'Transit';
  return 'Rideshare';
}

function transitKindLabel(k: TransitStop['kind']): string {
  if (k === 'bus') return 'Bus';
  if (k === 'tram') return 'Tram';
  if (k === 'subway') return 'Subway';
  return 'Rail';
}

function deriveNeedsFromSummaryText(text: string): { severity?: 'routine' | 'soon' | 'emergency'; requiredSpecialties: string[] } {
  const lower = (text ?? '').toLowerCase();
  const required = new Set<string>();

  if (/\b(rash|itch|hives|eczema|derm|skin)\b/.test(lower)) required.add('dermatology');
  if (/\b(fracture|sprain|strain|ankle|knee|shoulder|orthopedic|ortho|bone)\b/.test(lower)) required.add('orthopedics');
  if (/\b(chest pain|pressure|heart|palpitation|cardio)\b/.test(lower)) required.add('cardiology');
  if (/\b(cough|shortness of breath|breathing|asthma|pulmo|wheez)\b/.test(lower)) required.add('pulmonology');
  if (/\b(stroke|weakness|numbness|slurred|neuro|seizure)\b/.test(lower)) required.add('neurology');
  if (/\b(abdominal|stomach|vomit|diarrhea|gi\b|gastro)\b/.test(lower)) required.add('gastroenterology');

  let severity: 'routine' | 'soon' | 'emergency' | undefined;
  if (/\b(call 911|emergency|immediately|severe|trouble breathing|stroke)\b/.test(lower)) severity = 'emergency';
  else if (/\b(urgent|same-day|today)\b/.test(lower)) severity = 'soon';

  return { severity, requiredSpecialties: Array.from(required) };
}

function featureCollectionFromGeometries(geoms: any[]): any {
  return {
    type: 'FeatureCollection',
    features: (geoms ?? [])
      .filter(Boolean)
      .map((g) => ({ type: 'Feature', properties: {}, geometry: g })),
  };
}

function appleTransitLink(from: { lat: number; lng: number }, to: { lat: number; lng: number }): string {
  // Apple Maps directions; dirflg=r for public transit
  return `http://maps.apple.com/?saddr=${from.lat},${from.lng}&daddr=${to.lat},${to.lng}&dirflg=r`;
}

function googleTransitLink(from: { lat: number; lng: number }, to: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=transit`;
}

function uberDeepLink(from: { lat: number; lng: number }, to: { lat: number; lng: number }, destName: string): string {
  return (
    `https://m.uber.com/ul/?action=setPickup` +
    `&pickup[latitude]=${encodeURIComponent(String(from.lat))}` +
    `&pickup[longitude]=${encodeURIComponent(String(from.lng))}` +
    `&dropoff[latitude]=${encodeURIComponent(String(to.lat))}` +
    `&dropoff[longitude]=${encodeURIComponent(String(to.lng))}` +
    `&dropoff[nickname]=${encodeURIComponent(destName || 'Destination')}`
  );
}

function lyftDeepLink(from: { lat: number; lng: number }, to: { lat: number; lng: number }): string {
  return (
    `https://ride.lyft.com/?pickup[latitude]=${encodeURIComponent(String(from.lat))}` +
    `&pickup[longitude]=${encodeURIComponent(String(from.lng))}` +
    `&destination[latitude]=${encodeURIComponent(String(to.lat))}` +
    `&destination[longitude]=${encodeURIComponent(String(to.lng))}`
  );
}

function describeGeoError(e: unknown): string {
  // GeolocationPositionError is not consistently stringified across browsers.
  const anyE = e as any;
  const code = typeof anyE?.code === 'number' ? anyE.code : undefined; // 1=permission,2=unavailable,3=timeout
  const msg = typeof anyE?.message === 'string' ? anyE.message : '';
  if (code === 1) return 'Location permission blocked. In your browser address bar/site settings, allow Location, then try again.';
  if (code === 2) return 'Location unavailable. Try moving closer to a window, turning on Wi‑Fi, or trying again.';
  if (code === 3)
    return 'Location timed out. Try again. If it keeps timing out, enable Location Services on your computer and allow your browser to use location.';
  if (msg) return msg;
  if (typeof e === 'string') return e;
  return 'Could not get location. Please check browser location permissions and try again.';
}

type GeoPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

export default function CareMapPage() {
  const search = useSearchParams();
  const visitId = (search.get('visitId') ?? '').trim();

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const routeRef = useRef<any>(null); // GeoJSON FeatureCollection for map rendering
  const nearbyInFlightRef = useRef(false);
  const bestInFlightRef = useRef(false);
  const routeInFlightRef = useRef(false);

  const [mounted, setMounted] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [geoPerm, setGeoPerm] = useState<GeoPermissionState>('unknown');
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locStatus, setLocStatus] = useState<'idle' | 'locating' | 'ok' | 'error'>('idle');
  const [locError, setLocError] = useState<string | null>(null);
  const [manualQuery, setManualQuery] = useState('');
  const [manualBusy, setManualBusy] = useState(false);

  const [radiusMi, setRadiusMi] = useState<2 | 5 | 10>(5);
  const radiusM = useMemo(() => milesToMeters(radiusMi), [radiusMi]);

  const [filters, setFilters] = useState({
    hospital: true,
    urgent_care: true,
    primary_care: true,
    specialist: true,
    pharmacy: true,
    transit: false,
  });

  const [places, setPlaces] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(true);

  const [selected, setSelected] = useState<Place | null>(null);
  const [route, setRoute] = useState<RouteResp | null>(null);
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeMode, setRouteMode] = useState<RouteMode>('drive');
  const [driveEstimate, setDriveEstimate] = useState<{ distanceMeters: number; durationSeconds: number; fallback?: boolean } | null>(null);
  const [transitPlan, setTransitPlan] = useState<TransitPlanResp | null>(null);

  const [severity, setSeverity] = useState<'routine' | 'soon' | 'emergency'>('routine');
  const [needSpec, setNeedSpec] = useState({
    dermatology: false,
    orthopedics: false,
    cardiology: false,
    pulmonology: false,
    neurology: false,
    gastroenterology: false,
  });
  const [useVisitNeeds, setUseVisitNeeds] = useState(false);
  const [visitNeedsBusy, setVisitNeedsBusy] = useState(false);
  const [visitNeeds, setVisitNeeds] = useState<{ severity?: 'routine' | 'soon' | 'emergency'; requiredSpecialties: string[] } | null>(null);
  const [best, setBest] = useState<{ place: Place | null; reasoning: string[] }>({ place: null, reasoning: [] });

  const shareUrl = useMemo(() => {
    if (!mounted) return '';
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim() || (typeof window !== 'undefined' ? window.location.origin : '');
    if (!base || !visitId) return '';
    return `${base}/visit/invite?visitId=${encodeURIComponent(visitId)}`;
  }, [mounted, visitId]);

  useEffect(() => {
    if (!useVisitNeeds) return;
    if (!visitId) return;
    let cancelled = false;
    (async () => {
      try {
        setVisitNeedsBusy(true);
        const r = await fetch(`${API}/api/visit/${encodeURIComponent(visitId)}/summary`);
        const data = await r.json().catch(() => ({}));
        const s = (data as any)?.summary ?? {};
        const blob = `${String(s?.whatIHeard ?? '')}\n${Array.isArray(s?.likelyPossibilities) ? s.likelyPossibilities.join('\n') : ''}\n${Array.isArray(s?.warningSigns) ? s.warningSigns.join('\n') : ''}`;
        const derived = deriveNeedsFromSummaryText(blob);
        if (cancelled) return;
        setVisitNeeds(derived);
      } catch {
        if (cancelled) return;
        setVisitNeeds({ requiredSpecialties: [] });
      } finally {
        if (!cancelled) setVisitNeedsBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useVisitNeeds, visitId]);

  const effectiveTypes = useMemo(() => {
    const out: string[] = [];
    for (const [k, v] of Object.entries(filters)) if (v) out.push(k);
    return out.join(',');
  }, [filters]);

  useEffect(() => setMounted(true), []);

  // Load MapLibre CSS only while this page is mounted.
  // MapLibre's stylesheet contains some generic rules that can affect the rest of the app
  // if it stays loaded after leaving /care-map.
  useEffect(() => {
    const id = 'carezoom-maplibre-css';
    if (typeof document === 'undefined') return;
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@5.7.0/dist/maplibre-gl.css';
      document.head.appendChild(link);
    }
    return () => {
      try {
        link?.remove();
      } catch {}
    };
  }, []);

  const refreshGeoPermission = async () => {
    try {
      const anyNav = navigator as any;
      if (!anyNav?.permissions?.query) {
        setGeoPerm('unknown');
        return;
      }
      const s = await anyNav.permissions.query({ name: 'geolocation' });
      const state = (s?.state ?? 'unknown') as GeoPermissionState;
      setGeoPerm(state);
      if (typeof s?.addEventListener === 'function') {
        s.addEventListener('change', () => {
          setGeoPerm((s.state ?? 'unknown') as GeoPermissionState);
        });
      }
    } catch {
      setGeoPerm('unknown');
    }
  };

  const initMap = async (center: { lat: number; lng: number }) => {
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;
    const maplibregl = await import('maplibre-gl');
    const style = {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors',
        },
      },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
    } as any;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style,
      center: [center.lng, center.lat],
      zoom: 13,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      setMapReady(true);
      // Prevent blank renders when container size changes during init.
      try {
        map.resize();
        window.setTimeout(() => map.resize(), 50);
      } catch {}
      // Route layer placeholders
      if (!map.getSource('route')) {
        map.addSource('route', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }
      if (!map.getLayer('route-line')) {
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          paint: { 'line-color': '#4F46E5', 'line-width': 6 },
        });
      }
      // If we already have a route, draw it now.
      if (routeRef.current) {
        try {
          const src = map.getSource('route') as any;
          src?.setData(routeRef.current);
        } catch {}
      }
    });
  };

  const updateMarkers = async (ps: Place[]) => {
    const map = mapRef.current;
    if (!map) return;
    const maplibregl = await import('maplibre-gl');

    for (const m of markersRef.current) {
      try {
        m.remove();
      } catch {}
    }
    markersRef.current = [];

    for (const p of ps) {
      const m = new maplibregl.Marker({ color: markerColor(p) })
        .setLngLat([p.lng, p.lat])
        .addTo(map);
      m.getElement().style.cursor = 'pointer';
      m.getElement().addEventListener('click', () => {
        setSelected(p);
      });
      markersRef.current.push(m);
    }
  };

  const setRouteOnMap = (geojson: any | null) => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource('route');
    if (!src) {
      // Map not loaded yet; we'll render on load.
      return;
    }
    src.setData(geojson ?? { type: 'FeatureCollection', features: [] });
  };

  const getLocation = async () => {
    setLocStatus('locating');
    setLocError(null);
    setNote('Locating… If asked, please allow Location.');
    try {
      // Geolocation requires a secure context on most browsers (HTTPS), except localhost.
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        throw new Error('Location requires HTTPS. Use an https URL (or localhost) and allow Location in your browser settings.');
      }
      await refreshGeoPermission();
      if (geoPerm === 'denied') {
        throw new Error(
          'Location permission is blocked for this site. In your browser site settings, change Location to “Allow”, then reload and try again.'
        );
      }
      if (!navigator.geolocation) throw new Error('Location is not supported in this browser.');
      // Try a fast/low-accuracy request first (often returns instantly on desktops),
      // then fall back to high accuracy if needed.
      const tryGet = (opts: PositionOptions) =>
        new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, opts)
        );
      let pos: GeolocationPosition;
      try {
        pos = await tryGet({ enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 });
      } catch (e) {
        const anyE = e as any;
        if (typeof anyE?.code === 'number' && anyE.code === 1) throw e; // permission denied
        pos = await tryGet({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
      }
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setLoc(next);
      setLocStatus('ok');
      setNote('Location updated.');
      await initMap(next);
      mapRef.current?.setCenter([next.lng, next.lat]);
      return next;
    } catch (e) {
      setLocStatus('error');
      const text = describeGeoError(e);
      setLocError(text);
      setNote(text);
      return null;
    }
  };

  const updateLocationAndRefresh = async () => {
    setNote('Updating location…');
    const c = await getLocation();
    if (!c) return;
    // Clear old selection/route when location changes.
    setSelected(null);
    setRoute(null);
    setRouteOnMap(null);
    await refreshNearby(c);
    await refreshBest(c);
  };

  const setLocationFromAddress = async () => {
    const q = manualQuery.trim();
    if (!q) {
      setNote('Type an address or ZIP code first.');
      return;
    }
    setManualBusy(true);
    setNote('Finding that place on the map…');
    try {
      const r = await fetch(`${API}/api/geo/geocode?q=${encodeURIComponent(q)}&country=us`);
      const data = await r.json();
      if (!r.ok || (data as any).error) throw new Error((data as any).details || (data as any).error || 'Geocode failed');
      const next = { lat: Number(data.lat), lng: Number(data.lng) };
      if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) throw new Error('Geocode returned invalid coordinates');
      setLoc(next);
      setLocStatus('ok');
      setLocError(null);
      setNote(`Location set to: ${String(data.displayName ?? q)}`);
      await initMap(next);
      mapRef.current?.setCenter([next.lng, next.lat]);
      setSelected(null);
      setRoute(null);
      setRouteOnMap(null);
      await refreshNearby(next);
      await refreshBest(next);
    } catch (e) {
      setNote(`Could not set location: ${String(e)}`);
    } finally {
      setManualBusy(false);
    }
  };

  const refreshNearby = async (locArg?: { lat: number; lng: number } | null) => {
    if (nearbyInFlightRef.current) return;
    const c = locArg ?? loc;
    if (!c) return;
    nearbyInFlightRef.current = true;
    setBusy(true);
    try {
      const ac = new AbortController();
      const t = window.setTimeout(() => ac.abort(), 20_000);
      const url = `${API}/api/geo/nearby?lat=${c.lat}&lng=${c.lng}&radiusM=${radiusM}&types=${encodeURIComponent(effectiveTypes)}`;
      const res = await fetch(url, { signal: ac.signal });
      window.clearTimeout(t);
      const data = await res.json();
      const ps = (data.places ?? []) as Place[];
      setPlaces(ps);
      await initMap(c);
      await updateMarkers(ps);
      if (ps.length) {
        setNote(`Found ${ps.length} nearby options. Tap one for details.`);
      } else {
        setNote('No results found in this area. Try a larger radius.');
      }
    } catch (e) {
      setPlaces([]);
      setNote(`Could not load nearby care: ${String(e)}`);
    } finally {
      setBusy(false);
      nearbyInFlightRef.current = false;
    }
  };

  const refreshBest = async (locArg?: { lat: number; lng: number } | null) => {
    if (bestInFlightRef.current) return;
    const c = locArg ?? loc;
    if (!c) return;
    bestInFlightRef.current = true;
    const derivedRequired = useVisitNeeds ? (visitNeeds?.requiredSpecialties ?? []) : [];
    const required = (useVisitNeeds && derivedRequired.length
      ? derivedRequired
      : Object.entries(needSpec)
          .filter(([, v]) => v)
          .map(([k]) => k)) as string[];
    const effectiveSeverity = (useVisitNeeds && visitNeeds?.severity ? visitNeeds.severity : severity) as
      | 'routine'
      | 'soon'
      | 'emergency';
    try {
      const ac = new AbortController();
      const t = window.setTimeout(() => ac.abort(), 20_000);
      const res = await fetch(`${API}/api/geo/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ac.signal,
        body: JSON.stringify({
          lat: c.lat,
          lng: c.lng,
          radiusM,
          patientNeeds: {
            severity: effectiveSeverity,
            requiredSpecialties: required,
            flags: [],
          },
        }),
      });
      window.clearTimeout(t);
      const data = await res.json();
      setBest({ place: (data.recommendedPlace as Place) ?? null, reasoning: (data.reasoning ?? []) as string[] });
    } catch {
      setBest({ place: null, reasoning: [] });
    } finally {
      bestInFlightRef.current = false;
    }
  };

  const routeTo = async (p: Place, mode: RouteMode = 'drive') => {
    if (!loc) return;
    if (routeInFlightRef.current) return;
    routeInFlightRef.current = true;
    setSelected(p);
    setRouteMode(mode);
    setRouteBusy(true);
    setRoute(null);
    setDriveEstimate(null);
    setTransitPlan(null);
    routeRef.current = null;
    setRouteOnMap(null);
    setNote(mode === 'transit' ? 'Planning transit assist…' : 'Routing… This can take a few seconds.');
    try {
      if (mode === 'drive' || mode === 'walk' || mode === 'rideshare') {
        const osrmMode = mode === 'walk' ? 'walking' : 'driving';
        const ac = new AbortController();
        const t = window.setTimeout(() => ac.abort(), 15_000);
        const r = await fetch(
          `${API}/api/geo/route?fromLat=${loc.lat}&fromLng=${loc.lng}&toLat=${p.lat}&toLng=${p.lng}&mode=${osrmMode}`,
          { signal: ac.signal }
        );
        window.clearTimeout(t);
        const data = (await r.json()) as RouteResp;
        if ((data as any).error) throw new Error((data as any).details || (data as any).error);
        setRoute(data);
        setDriveEstimate({ distanceMeters: data.distanceMeters, durationSeconds: data.durationSeconds, fallback: data.fallback });
        const fc = featureCollectionFromGeometries([data.geometry]);
        routeRef.current = fc;
        setRouteOnMap(fc);
        mapRef.current?.fitBounds(
          [
            [Math.min(loc.lng, p.lng), Math.min(loc.lat, p.lat)],
            [Math.max(loc.lng, p.lng), Math.max(loc.lat, p.lat)],
          ],
          { padding: 60 }
        );
        mapContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (data.fallback) setNote('Route ready (approximate). OSRM routing server is unavailable right now.');
        else setNote(mode === 'rideshare' ? 'Rideshare options ready.' : 'Route ready. The route line is shown on the map.');
      } else {
        const ac = new AbortController();
        const t = window.setTimeout(() => ac.abort(), 20_000);
        const r = await fetch(`${API}/api/geo/transit/plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ac.signal,
          body: JSON.stringify({
            fromLat: loc.lat,
            fromLng: loc.lng,
            toLat: p.lat,
            toLng: p.lng,
            radiusM: 800,
          }),
        });
        window.clearTimeout(t);
        const data = (await r.json()) as TransitPlanResp;
        setTransitPlan(data);

        const walkA = (data as any)?.suggested?.walkToStart?.geometry;
        const walkB = (data as any)?.suggested?.walkFromEnd?.geometry;
        const fc = featureCollectionFromGeometries([walkA, walkB]);
        routeRef.current = fc;
        setRouteOnMap(fc);

        // Fit bounds for all involved points
        const pts: Array<{ lat: number; lng: number }> = [{ lat: loc.lat, lng: loc.lng }, { lat: p.lat, lng: p.lng }];
        const ss = data?.suggested?.startStop;
        const es = data?.suggested?.endStop;
        if (ss) pts.push({ lat: ss.lat, lng: ss.lng });
        if (es) pts.push({ lat: es.lat, lng: es.lng });
        const minLng = Math.min(...pts.map((x) => x.lng));
        const maxLng = Math.max(...pts.map((x) => x.lng));
        const minLat = Math.min(...pts.map((x) => x.lat));
        const maxLat = Math.max(...pts.map((x) => x.lat));
        mapRef.current?.fitBounds(
          [
            [minLng, minLat],
            [maxLng, maxLat],
          ],
          { padding: 60 }
        );
        mapContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setNote('Transit assist ready. This does not include schedule-based ride time.');
      }
    } catch (e) {
      setNote(`Could not get route (OSRM may be slow right now): ${String(e)}`);
    } finally {
      setRouteBusy(false);
      routeInFlightRef.current = false;
    }
  };

  // Initial location + data load
  useEffect(() => {
    (async () => {
      await refreshGeoPermission();
      await initMap(DEFAULT_CENTER);
      const c = await getLocation().catch(() => null);
      if (c) {
        await refreshNearby(c);
        await refreshBest(c);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll every 10s (nearby + best) when we have a location.
  useEffect(() => {
    if (!loc) return;
    const id = window.setInterval(() => {
      // Avoid piling up requests while routing or already loading.
      if (routeInFlightRef.current || nearbyInFlightRef.current || bestInFlightRef.current) return;
      refreshNearby().catch(() => {});
      refreshBest().catch(() => {});
    }, 10_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc, radiusM, effectiveTypes, severity, needSpec]);

  // Refresh when filters/radius changes.
  useEffect(() => {
    if (!loc) return;
    refreshNearby().catch(() => {});
    refreshBest().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radiusM, effectiveTypes, severity, needSpec]);

  const locationText =
    locStatus === 'locating'
      ? 'Locating…'
      : loc
        ? `Location: ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`
        : locStatus === 'error'
          ? 'Location unavailable'
          : 'Location not set';

  const bestPlace = best.place;

  const copyCaregiver = async () => {
    if (!shareUrl) {
      setNote('Add a visitId to the URL: /care-map?visitId=... then you can share with a caregiver.');
      return;
    }
    await navigator.clipboard.writeText(shareUrl);
    setNote('Caregiver link copied.');
  };

  return (
    <main className="h-[calc(100vh-56px)] bg-slate-50">
      <div className="h-full lg:grid lg:grid-cols-[420px_1fr]">
        {/* Sidebar */}
        <aside className="hidden lg:block border-r border-slate-200 bg-slate-50">
          <div className="h-full overflow-y-auto p-4 space-y-4">
            <header className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-lg font-semibold tracking-tight text-slate-900">Care Map</h1>
                  <p className="text-sm text-slate-600 truncate">{locationText}</p>
                  <p className="text-xs text-slate-500 mt-1">Location permission: {geoPerm}</p>
                  {locError && <p className="text-xs text-amber-900 mt-2 break-words">{locError}</p>}
                </div>
                <div className="flex flex-col gap-2">
                  <button className="senior-btn-secondary" onClick={updateLocationAndRefresh} disabled={locStatus === 'locating'}>
                    {locStatus === 'locating' ? 'Locating…' : 'Locate'}
                  </button>
                  <button className="senior-btn-secondary" onClick={() => { refreshNearby().catch(() => {}); refreshBest().catch(() => {}); }} disabled={!loc || busy}>
                    {busy ? 'Refreshing…' : 'Refresh'}
                  </button>
                  <button className="senior-btn" onClick={copyCaregiver}>
                    Share
                  </button>
                </div>
              </div>
              {geoPerm === 'unknown' ? (
                <p className="text-xs text-slate-500 mt-2">
                  If location keeps timing out, use manual location below.
                </p>
              ) : null}
            </header>

            {/* Manual location */}
            <section className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="font-semibold text-slate-900">Manual location</p>
              <p className="text-xs text-slate-500 mt-1">ZIP code or address</p>
              <div className="mt-3 grid grid-cols-1 gap-2">
                <input
                  className="senior-input max-w-none"
                  value={manualQuery}
                  onChange={(e) => setManualQuery(e.target.value)}
                  placeholder="e.g. 15213 Pittsburgh PA"
                />
                <button className="senior-btn-secondary w-full !min-w-0" onClick={setLocationFromAddress} disabled={manualBusy}>
                  {manualBusy ? 'Searching…' : 'Set location'}
                </button>
              </div>
            </section>

            {note && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-700">
                {note}
                {shareUrl && (
                  <div className="mt-2 break-all text-xs text-slate-500">
                    Caregiver link: <span className="font-mono">{shareUrl}</span>
                  </div>
                )}
              </div>
            )}

            {/* Best option */}
            <section className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-indigo-900">Best option for you</p>
                  {bestPlace ? (
                    <div className="mt-1 text-sm text-slate-900">
                      <div className="font-semibold truncate">{bestPlace.name}</div>
                      <div className="text-xs text-slate-600">
                        {typeLabel(bestPlace.type)} • {fmtMi(bestPlace.distanceMeters)} • ETA {fmtMin(bestPlace.etaSeconds)}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-700 mt-1">Loading recommendation…</p>
                  )}
                </div>
                <button
                  className="senior-btn !min-w-0"
                  onClick={() => (bestPlace ? routeTo(bestPlace, routeMode) : null)}
                  disabled={!bestPlace || !loc || routeBusy}
                >
                  Route
                </button>
              </div>
              {best.reasoning?.length ? (
                <ul className="mt-3 list-disc pl-5 text-xs text-slate-700 space-y-1">
                  {best.reasoning.slice(0, 3).map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              ) : null}
            </section>

            {/* Filters + radius */}
            <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-900">Filters</p>
                <div className="text-xs text-slate-500">Radius</div>
              </div>
              <div className="grid gap-2">
                {(
                  [
                    ['hospital', 'Hospitals / ER'],
                    ['urgent_care', 'Urgent care'],
                    ['primary_care', 'Primary care'],
                    ['specialist', 'Specialists'],
                    ['pharmacy', 'Pharmacies'],
                    ['transit', 'Transit'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-700">{label}</span>
                    <input
                      type="checkbox"
                      checked={(filters as any)[key]}
                      onChange={(e) => setFilters((prev) => ({ ...prev, [key]: e.target.checked }))}
                      className="h-4 w-4 accent-indigo-600"
                    />
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[2, 5, 10].map((mi) => (
                  <button
                    key={mi}
                    className={mi === radiusMi ? 'senior-btn w-full !min-w-0' : 'senior-btn-secondary w-full !min-w-0'}
                    onClick={() => setRadiusMi(mi as any)}
                  >
                    {mi} mi
                  </button>
                ))}
              </div>
            </section>

            {/* Results */}
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900">Results</p>
                  <p className="text-xs text-slate-500 mt-0.5">Tap a pin or a row to view.</p>
                </div>
                <button className="senior-btn-secondary !min-w-0" onClick={() => refreshNearby()} disabled={!loc || busy}>
                  {busy ? 'Updating…' : 'Refresh'}
                </button>
              </div>
              <ul className="divide-y divide-slate-200 max-h-[46vh] overflow-y-auto">
                {places.length ? (
                  places.map((p) => (
                    <li key={p.id} className={selected?.id === p.id ? 'bg-slate-50 border-l-4 border-indigo-600' : 'hover:bg-slate-50'}>
                      <button
                        className="text-left w-full p-4"
                        onClick={() => {
                          setSelected(p);
                          mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom: 14 });
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate">{p.name}</div>
                            <div className="text-xs text-slate-600 truncate">{typeLabel(p.type)} • {p.address || '—'}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs font-semibold text-slate-900">{fmtMi(p.distanceMeters)}</div>
                            <div className="text-xs text-slate-600">{fmtMin(p.etaSeconds)}</div>
                            {p.type === 'hospital' ? (
                              <div className="mt-1">
                                <span className={`px-2 py-0.5 rounded-full border text-[10px] ${capBadgeClasses(p.capacity?.status)}`}>
                                  {p.capacity?.status ? p.capacity.status.toUpperCase() : '—'}
                                </span>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </button>
                      <div className="px-4 pb-4 grid grid-cols-2 gap-2">
                        <button className="senior-btn-secondary !min-w-0" onClick={() => routeTo(p, routeMode)} disabled={!loc || routeBusy}>
                          {routeBusy ? 'Routing…' : 'Route'}
                        </button>
                        {p.phone ? (
                          <a className="senior-btn-secondary !min-w-0 text-center" href={`tel:${p.phone}`}>
                            Call
                          </a>
                        ) : (
                          <button className="senior-btn-secondary !min-w-0" disabled>
                            Call
                          </button>
                        )}
                        {p.website ? (
                          <a className="senior-btn-secondary !min-w-0 text-center col-span-2" href={p.website} target="_blank" rel="noreferrer">
                            Website
                          </a>
                        ) : (
                          <button className="senior-btn-secondary !min-w-0 col-span-2" disabled>
                            Website
                          </button>
                        )}
                      </div>
                    </li>
                  ))
                ) : (
                  <li className="p-4 text-sm text-slate-600">No places found in this radius. Try 10 mi.</li>
                )}
              </ul>
            </section>
          </div>
        </aside>

        {/* Map hero */}
        <section className="relative h-full">
          <div className="absolute inset-0 p-3 lg:p-4">
            <div className="relative h-full rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div ref={mapContainerRef} className="absolute inset-0" />

              {!mapReady ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="rounded-xl border border-slate-200 bg-white/90 backdrop-blur px-4 py-3 shadow-sm">
                    <div className="text-sm font-semibold text-slate-900">Loading map…</div>
                    <div className="text-xs text-slate-600 mt-1">If location is blocked, use manual location in the sidebar.</div>
                  </div>
                </div>
              ) : null}

              {routeMode === 'transit' && transitPlan ? (
                <div className="absolute top-3 left-3 rounded-xl border border-slate-200 bg-white/90 backdrop-blur px-3 py-2 text-xs text-slate-700 shadow-sm">
                  Transit assist • schedule-dependent
                </div>
              ) : route ? (
                <div className="absolute top-3 left-3 rounded-xl border border-slate-200 bg-white/90 backdrop-blur px-3 py-2 text-xs text-slate-700 shadow-sm">
                  Route: {fmtMi(route.distanceMeters)} • ETA {fmtMin(route.durationSeconds)}
                </div>
              ) : null}

              {/* Mobile bottom sheet controls */}
              <div className="lg:hidden absolute left-0 right-0 bottom-0 p-3">
                <div
                  className={[
                    'rounded-2xl border border-slate-200 bg-white/95 backdrop-blur shadow-lg overflow-hidden transition-[height] duration-200',
                    mobileSheetOpen ? 'h-[62vh]' : 'h-14',
                  ].join(' ')}
                >
                  <button
                    type="button"
                    onClick={() => setMobileSheetOpen((v) => !v)}
                    className="w-full px-4 py-3 flex items-center justify-between"
                  >
                    <div className="text-sm font-semibold text-slate-900">Care Map</div>
                    <div className="text-xs text-slate-600">{mobileSheetOpen ? 'Collapse' : 'Expand'}</div>
                  </button>

                  {mobileSheetOpen ? (
                    <div className="px-4 pb-4 space-y-3 overflow-y-auto h-[calc(62vh-48px)]">
                      <div className="text-xs text-slate-500 truncate">{locationText}</div>
                      {locError ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{locError}</div> : null}
                      {note ? <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">{note}</div> : null}

                      <div className="flex flex-wrap gap-2">
                        <button className="senior-btn-secondary !min-w-0" onClick={updateLocationAndRefresh} disabled={locStatus === 'locating'}>
                          {locStatus === 'locating' ? 'Locating…' : 'Locate'}
                        </button>
                        <button className="senior-btn-secondary !min-w-0" onClick={() => { refreshNearby().catch(() => {}); refreshBest().catch(() => {}); }} disabled={!loc || busy}>
                          {busy ? 'Refreshing…' : 'Refresh'}
                        </button>
                        <button className="senior-btn !min-w-0" onClick={copyCaregiver}>
                          Share
                        </button>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-xs font-semibold text-slate-700">Manual location</div>
                        <div className="mt-2 flex gap-2">
                          <input
                            className="senior-input max-w-none"
                            value={manualQuery}
                            onChange={(e) => setManualQuery(e.target.value)}
                            placeholder="ZIP / address"
                          />
                          <button className="senior-btn-secondary !min-w-0" onClick={setLocationFromAddress} disabled={manualBusy}>
                            {manualBusy ? '…' : 'Set'}
                          </button>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-semibold text-slate-700">Filters</div>
                          <div className="text-xs text-slate-500">Radius</div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {(
                            [
                              ['hospital', 'Hospitals'],
                              ['urgent_care', 'Urgent care'],
                              ['primary_care', 'Clinics'],
                              ['specialist', 'Specialists'],
                              ['pharmacy', 'Pharmacies'],
                              ['transit', 'Transit'],
                            ] as const
                          ).map(([key, label]) => (
                            <label key={key} className="flex items-center justify-between gap-2 text-xs text-slate-700">
                              <span>{label}</span>
                              <input
                                type="checkbox"
                                checked={(filters as any)[key]}
                                onChange={(e) => setFilters((prev) => ({ ...prev, [key]: e.target.checked }))}
                                className="h-4 w-4 accent-indigo-600"
                              />
                            </label>
                          ))}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {[2, 5, 10].map((mi) => (
                            <button
                              key={mi}
                              className={mi === radiusMi ? 'senior-btn w-full !min-w-0' : 'senior-btn-secondary w-full !min-w-0'}
                              onClick={() => setRadiusMi(mi as any)}
                            >
                              {mi} mi
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                        <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                          <div className="text-xs font-semibold text-slate-700">Results</div>
                          <button className="senior-btn-secondary !min-w-0" onClick={() => refreshNearby()} disabled={!loc || busy}>
                            {busy ? '…' : 'Refresh'}
                          </button>
                        </div>
                        <ul className="divide-y divide-slate-200 max-h-[28vh] overflow-y-auto">
                          {places.length ? (
                            places.map((p) => (
                              <li key={p.id}>
                                <button
                                  type="button"
                                  className="w-full text-left px-3 py-3 hover:bg-slate-50"
                                  onClick={() => {
                                    setSelected(p);
                                    mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom: 14 });
                                    setMobileSheetOpen(false);
                                  }}
                                >
                                  <div className="font-semibold text-slate-900 truncate">{p.name}</div>
                                  <div className="text-[11px] text-slate-600 truncate">
                                    {typeLabel(p.type)} • {fmtMi(p.distanceMeters)} • {fmtMin(p.etaSeconds)}
                                  </div>
                                </button>
                              </li>
                            ))
                          ) : (
                            <li className="px-3 py-3 text-sm text-slate-600">No results found. Try 10 mi.</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Modal (kept) */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-xl max-w-xl w-full p-5 border border-slate-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xl font-semibold tracking-tight text-slate-900">{selected.name}</div>
                <div className="text-sm text-slate-700 mt-1">
                  {typeLabel(selected.type)} • {fmtMi(selected.distanceMeters)} • ETA {fmtMin(selected.etaSeconds)}
                </div>
                {selected.address ? <div className="text-sm text-slate-600 mt-1">{selected.address}</div> : null}
              </div>
              <button className="senior-btn-secondary !min-w-0 px-3 py-2" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-sm font-semibold text-slate-700">Route mode</div>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['drive', 'walk', 'transit', 'rideshare'] as RouteMode[]).map((m) => (
                  <button
                    key={m}
                    className={m === routeMode ? 'senior-btn w-full !min-w-0' : 'senior-btn-secondary w-full !min-w-0'}
                    onClick={() => routeTo(selected, m)}
                    disabled={!loc || routeBusy}
                  >
                    {modeLabel(m)}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-xs text-slate-600">
                Transit is best-effort (no schedules). Rideshare opens Uber/Lyft.
              </div>
            </div>

            {selected.type === 'hospital' && selected.capacity ? (
              <div className="mt-3 flex flex-wrap gap-2 items-center">
                <span className={`px-3 py-1 rounded-full border text-sm ${capBadgeClasses(selected.capacity.status)}`}>
                  {selected.capacity.status.toUpperCase()}
                </span>
                <span className="text-sm text-slate-700">
                  {selected.capacity.acceptingPatients ? 'Accepting patients' : 'Not accepting patients'}
                </span>
                <span className="text-sm text-slate-600">Beds open: {selected.capacity.bedsOpen}</span>
              </div>
            ) : null}

            {Array.isArray(selected.specialties) && selected.specialties.length ? (
              <div className="mt-3">
                <div className="font-semibold">Specialties</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selected.specialties.slice(0, 12).map((s) => (
                    <span key={s} className="px-2 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs border border-slate-200">
                      {shortSpecialty(s)}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2 mt-4">
              <button className="senior-btn-secondary !min-w-0" onClick={() => routeTo(selected, routeMode)} disabled={!loc || routeBusy}>
                {routeBusy ? 'Loading…' : routeMode === 'rideshare' ? 'Refresh estimate' : 'Get directions'}
              </button>
              {selected.phone ? (
                <a className="senior-btn-secondary !min-w-0 text-center" href={`tel:${selected.phone}`}>
                  Call
                </a>
              ) : (
                <button className="senior-btn-secondary !min-w-0" disabled>
                  Call
                </button>
              )}
              {selected.website ? (
                <a className="senior-btn-secondary !min-w-0 text-center col-span-2" href={selected.website} target="_blank" rel="noreferrer">
                  Website
                </a>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}


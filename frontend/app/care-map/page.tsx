'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const API = (process.env.NEXT_PUBLIC_API_URL ?? '').trim() || 'http://localhost:4000';

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

function milesToMeters(mi: number): number {
  return Math.round(mi * 1609.34);
}

function metersToMiles(m: number): number {
  return m / 1609.34;
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
  const routeRef = useRef<RouteResp | null>(null);
  const nearbyInFlightRef = useRef(false);
  const bestInFlightRef = useRef(false);
  const routeInFlightRef = useRef(false);

  const [mounted, setMounted] = useState(false);
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

  const [selected, setSelected] = useState<Place | null>(null);
  const [route, setRoute] = useState<RouteResp | null>(null);
  const [routeBusy, setRouteBusy] = useState(false);

  const [severity, setSeverity] = useState<'routine' | 'soon' | 'emergency'>('routine');
  const [needSpec, setNeedSpec] = useState({
    dermatology: false,
    orthopedics: false,
    cardiology: false,
    pulmonology: false,
    neurology: false,
    gastroenterology: false,
  });
  const [best, setBest] = useState<{ place: Place | null; reasoning: string[] }>({ place: null, reasoning: [] });

  const shareUrl = useMemo(() => {
    if (!mounted) return '';
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim() || (typeof window !== 'undefined' ? window.location.origin : '');
    if (!base || !visitId) return '';
    return `${base}/visit/invite?visitId=${encodeURIComponent(visitId)}`;
  }, [mounted, visitId]);

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
          paint: { 'line-color': '#0d9488', 'line-width': 6 },
        });
      }
      // If we already have a route, draw it now.
      if (routeRef.current) {
        try {
          const src = map.getSource('route') as any;
          src?.setData({
            type: 'FeatureCollection',
            features: [{ type: 'Feature', properties: {}, geometry: routeRef.current.geometry }],
          });
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

  const setRouteOnMap = (r: RouteResp | null) => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource('route');
    if (!src) {
      // Map not loaded yet; we'll render on load.
      return;
    }
    const data =
      r && r.geometry
        ? {
            type: 'FeatureCollection',
            features: [{ type: 'Feature', properties: {}, geometry: r.geometry }],
          }
        : { type: 'FeatureCollection', features: [] };
    src.setData(data);
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
    const required = Object.entries(needSpec)
      .filter(([, v]) => v)
      .map(([k]) => k);
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
            severity,
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

  const routeTo = async (p: Place) => {
    if (!loc) return;
    if (routeInFlightRef.current) return;
    routeInFlightRef.current = true;
    setSelected(p);
    setRouteBusy(true);
    setRoute(null);
    setRouteOnMap(null);
    setNote('Routing… This can take a few seconds.');
    try {
      const ac = new AbortController();
      const t = window.setTimeout(() => ac.abort(), 15_000);
      const r = await fetch(
        `${API}/api/geo/route?fromLat=${loc.lat}&fromLng=${loc.lng}&toLat=${p.lat}&toLng=${p.lng}&mode=driving`,
        { signal: ac.signal }
      );
      window.clearTimeout(t);
      const data = (await r.json()) as RouteResp;
      if ((data as any).error) throw new Error((data as any).details || (data as any).error);
      setRoute(data);
      routeRef.current = data;
      setRouteOnMap(data);
      mapRef.current?.fitBounds(
        [
          [Math.min(loc.lng, p.lng), Math.min(loc.lat, p.lat)],
          [Math.max(loc.lng, p.lng), Math.max(loc.lat, p.lat)],
        ],
        { padding: 60 }
      );
      // Bring the map into view so users see the route line.
      mapContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (data.fallback) {
        setNote('Route ready (approximate). OSRM routing server is unavailable right now.');
      } else {
        setNote('Route ready. The route line is shown on the map and steps are listed in the directions box.');
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
      const c = await getLocation();
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
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto p-4 lg:p-6 space-y-4">
        <header className="bg-white border-2 border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">
          <div>
            <h1 className="text-senior-2xl font-bold text-slate-900">Care Map</h1>
            <p className="text-senior text-slate-700">{locationText}</p>
            <p className="text-sm text-slate-600 mt-1">Location permission: {geoPerm}</p>
            {locError && <p className="text-sm text-red-700 mt-1 break-words">{locError}</p>}
            {geoPerm === 'unknown' ? (
              <p className="text-sm text-slate-600 mt-1">
                Some browsers don’t report permission status. If “Update location” keeps timing out, use the manual location box below.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="senior-btn-secondary"
              onClick={updateLocationAndRefresh}
              disabled={locStatus === 'locating'}
            >
              {locStatus === 'locating' ? 'Locating…' : 'Update location'}
            </button>
            <button className="senior-btn-secondary" onClick={refreshGeoPermission}>
              Check permission
            </button>
            <button className="senior-btn-secondary" onClick={copyCaregiver}>
              Share with caregiver
            </button>
          </div>
        </header>

        {/* Manual location fallback */}
        <section className="bg-white border-2 border-slate-200 rounded-xl p-4">
          <p className="font-bold text-senior-lg">Manual location</p>
          <p className="text-sm text-slate-600 mt-1">If automatic location fails, type a ZIP code or address.</p>
          <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-2 items-center">
            <input
              className="senior-input max-w-none lg:col-span-2"
              value={manualQuery}
              onChange={(e) => setManualQuery(e.target.value)}
              placeholder="e.g. 15213 Pittsburgh PA or 5000 Forbes Ave Pittsburgh"
            />
            <button className="senior-btn-secondary w-full !min-w-0" onClick={setLocationFromAddress} disabled={manualBusy}>
              {manualBusy ? 'Searching…' : 'Set location'}
            </button>
          </div>
        </section>

        {note && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 text-senior text-slate-700">
            {note}
            {shareUrl && (
              <div className="mt-2 break-all text-sm text-slate-600">
                Caregiver link: <span className="font-mono">{shareUrl}</span>
              </div>
            )}
          </div>
        )}

        {/* Best option card */}
        <section className="bg-white border-2 border-slate-200 rounded-xl p-4">
          <div className="flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
            <div>
              <p className="font-bold text-senior-lg">Best option for you</p>
              {bestPlace ? (
                <div className="mt-2 text-senior text-slate-800">
                  <div className="font-semibold">{bestPlace.name}</div>
                  <div className="text-slate-600">
                    {typeLabel(bestPlace.type)} • {fmtMi(bestPlace.distanceMeters)} • ETA {fmtMin(bestPlace.etaSeconds)}
                  </div>
                  {bestPlace.capacity && (
                    <div className="mt-2 inline-flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full border text-sm ${capBadgeClasses(bestPlace.capacity.status)}`}>
                        {bestPlace.capacity.status.toUpperCase()} • {bestPlace.capacity.acceptingPatients ? 'Accepting' : 'Not accepting'}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-senior text-slate-700 mt-2">Loading recommendation…</p>
              )}
            </div>

            <div className="grid gap-2 w-full lg:w-[420px]">
              <label className="text-sm text-slate-700 font-medium">Urgency</label>
              <select className="senior-input max-w-none" value={severity} onChange={(e) => setSeverity(e.target.value as any)}>
                <option value="routine">Routine</option>
                <option value="soon">Soon (same/next day)</option>
                <option value="emergency">Emergency</option>
              </select>

              <label className="text-sm text-slate-700 font-medium mt-2">Specialty needs (optional)</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(needSpec).map(([k, v]) => (
                  <label key={k} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <input
                      type="checkbox"
                      checked={v}
                      onChange={(e) => setNeedSpec((prev) => ({ ...prev, [k]: e.target.checked }))}
                      className="w-5 h-5"
                    />
                    <span className="text-sm">{k.replace('_', ' ')}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {best.reasoning?.length ? (
            <ul className="mt-3 list-disc pl-6 text-senior text-slate-700">
              {best.reasoning.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          ) : null}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left panel */}
          <aside className="bg-white border-2 border-slate-200 rounded-xl p-4 space-y-4">
            <div>
              <p className="font-bold text-senior-lg">Filters</p>
              <div className="grid gap-2 mt-2">
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
                  <label key={key} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={(filters as any)[key]}
                      onChange={(e) => setFilters((prev) => ({ ...prev, [key]: e.target.checked }))}
                      className="w-6 h-6"
                    />
                    <span className="text-senior">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200" />

            <div>
              <p className="font-bold text-senior-lg">Radius</p>
              <div className="grid grid-cols-3 gap-2 mt-2">
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

            <div className="pt-2 border-t border-slate-200" />

            <div className="flex gap-2">
              <button className="senior-btn-secondary w-full !min-w-0" onClick={() => refreshNearby()} disabled={!loc || busy}>
                {busy ? 'Updating…' : 'Refresh results'}
              </button>
            </div>

            <div className="pt-2 border-t border-slate-200" />

            <div>
              <p className="font-bold text-senior-lg">Results</p>
              <p className="text-sm text-slate-600 mt-1">Tap a pin or a card to see details.</p>

              <ul className="mt-3 space-y-2 max-h-[50vh] overflow-y-auto">
                {places.map((p) => (
                  <li key={p.id} className="border border-slate-200 rounded-xl p-3">
                    <button
                      className="text-left w-full"
                      onClick={() => {
                        setSelected(p);
                        mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom: 14 });
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-senior">{p.name}</div>
                          <div className="text-sm text-slate-600">
                            {typeLabel(p.type)} • {fmtMi(p.distanceMeters)} • ETA {fmtMin(p.etaSeconds)}
                          </div>
                        </div>
                        {p.type === 'hospital' ? (
                          <span className={`px-3 py-1 rounded-full border text-sm ${capBadgeClasses(p.capacity?.status)}`}>
                            {p.capacity?.status ? p.capacity.status.toUpperCase() : '—'}
                          </span>
                        ) : null}
                      </div>
                      {Array.isArray(p.specialties) && p.specialties.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {p.specialties.slice(0, 6).map((s) => (
                            <span key={s} className="px-2 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs border border-slate-200">
                              {shortSpecialty(s)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </button>

                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <button className="senior-btn-secondary !min-w-0" onClick={() => routeTo(p)} disabled={!loc || routeBusy}>
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
                ))}
              </ul>
            </div>
          </aside>

          {/* Map */}
          <section className="lg:col-span-2 bg-white border-2 border-slate-200 rounded-xl overflow-hidden">
            <div className="p-3 border-b border-slate-200 flex flex-wrap gap-2 items-center justify-between">
              <p className="font-bold text-senior-lg">Map</p>
              {route ? (
                <div className="text-senior text-slate-700">
                  Route: {fmtMi(route.distanceMeters)} • ETA {fmtMin(route.durationSeconds)}
                </div>
              ) : (
                <div className="text-sm text-slate-600">Select a place, then press “Route”.</div>
              )}
            </div>
            <div ref={mapContainerRef} className="w-full h-[70vh] lg:h-[78vh]" />
          </section>
        </div>

        {/* Modal */}
        {selected && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
            <div className="bg-white rounded-2xl max-w-xl w-full p-5 border-2 border-slate-200" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-senior-2xl font-bold">{selected.name}</div>
                  <div className="text-senior text-slate-700 mt-1">
                    {typeLabel(selected.type)} • {fmtMi(selected.distanceMeters)} • ETA {fmtMin(selected.etaSeconds)}
                  </div>
                  {selected.address ? <div className="text-sm text-slate-600 mt-1">{selected.address}</div> : null}
                </div>
                <button className="senior-btn-secondary !min-w-0 px-4 py-2" onClick={() => setSelected(null)}>
                  Close
                </button>
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
                  <div className="font-semibold text-senior-lg">Specialties</div>
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
                <button className="senior-btn-secondary !min-w-0" onClick={() => routeTo(selected)} disabled={!loc || routeBusy}>
                  {routeBusy ? 'Routing…' : 'Get directions'}
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

              {route?.steps?.length ? (
                <div className="mt-4">
                  <div className="font-semibold text-senior-lg">Turn-by-turn</div>
                  <ol className="mt-2 space-y-2 max-h-52 overflow-y-auto pr-1">
                    {route.steps.slice(0, 14).map((s, i) => (
                      <li key={i} className="border border-slate-200 rounded-lg p-3 text-senior text-slate-800">
                        <div className="font-semibold">Step {i + 1}</div>
                        <div className="text-slate-700">{s.instruction}</div>
                        <div className="text-sm text-slate-600 mt-1">
                          {fmtMi(s.distanceMeters)} • {fmtMin(s.durationSeconds)}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}


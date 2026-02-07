export type CareMapPlaceType =
  | 'hospital'
  | 'urgent_care'
  | 'primary_care'
  | 'specialist'
  | 'pharmacy'
  | 'transit';

export type CareMapPlace = {
  id: string;
  name: string;
  type: CareMapPlaceType;
  lat: number;
  lng: number;
  address: string;
  phone?: string;
  website?: string;
  specialties?: string[];
  // Optional enrichment (computed elsewhere)
  capacity?: {
    status: 'green' | 'yellow' | 'red';
    bedsOpen: number;
    acceptingPatients: boolean;
    updatedAt: string;
  };
};

function cleanStr(x: unknown): string | undefined {
  const s = typeof x === 'string' ? x.trim() : '';
  return s ? s : undefined;
}

function parseSpecialties(tags: Record<string, any>): string[] | undefined {
  const raw = cleanStr(tags['healthcare:speciality'] ?? tags['healthcare:specialty']);
  if (!raw) return undefined;
  const parts = raw
    .split(/[;,]/g)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return parts.length ? Array.from(new Set(parts)) : undefined;
}

function buildAddress(tags: Record<string, any>): string {
  const parts = [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:city'],
    tags['addr:state'],
    tags['addr:postcode'],
  ].filter(Boolean);
  const line = parts.join(' ').trim();
  return line || tags['addr:full'] || tags['contact:address'] || '';
}

function inferType(tags: Record<string, any>): CareMapPlaceType {
  const amenity = cleanStr(tags.amenity)?.toLowerCase();
  const healthcare = cleanStr(tags.healthcare)?.toLowerCase();
  const speciality = cleanStr(tags['healthcare:speciality'] ?? tags['healthcare:specialty'])?.toLowerCase();

  if (amenity === 'pharmacy') return 'pharmacy';
  if (amenity === 'hospital' || tags.emergency === 'yes') return 'hospital';
  if (healthcare === 'urgent_care') return 'urgent_care';

  // Transit
  const highway = cleanStr(tags.highway)?.toLowerCase();
  const railway = cleanStr(tags.railway)?.toLowerCase();
  const pt = cleanStr(tags.public_transport)?.toLowerCase();
  if (highway === 'bus_stop' || railway === 'station' || pt === 'platform' || pt === 'station') return 'transit';

  // Clinics / doctors
  if (healthcare === 'specialist' || Boolean(speciality)) return 'specialist';
  if (amenity === 'clinic' || healthcare === 'clinic') return 'primary_care';
  if (amenity === 'doctors' || healthcare === 'doctor') return 'primary_care';

  // Fallback (should be rare with our queries)
  return 'primary_care';
}

function overpassFiltersForTypes(types: CareMapPlaceType[]): string[] {
  const out: string[] = [];
  const want = new Set(types);

  if (want.has('hospital')) out.push(`nwr["amenity"="hospital"]`);
  if (want.has('urgent_care')) out.push(`nwr["healthcare"="urgent_care"]`, `nwr["amenity"="clinic"]["healthcare"="urgent_care"]`);
  if (want.has('primary_care'))
    out.push(`nwr["amenity"="clinic"]`, `nwr["amenity"="doctors"]`, `nwr["healthcare"="doctor"]`, `nwr["healthcare"="clinic"]`);
  if (want.has('specialist'))
    out.push(
      `nwr["healthcare"="specialist"]`,
      `nwr["healthcare:speciality"]`,
      `nwr["healthcare:specialty"]`
    );
  if (want.has('pharmacy')) out.push(`nwr["amenity"="pharmacy"]`);
  if (want.has('transit'))
    out.push(
      `nwr["highway"="bus_stop"]`,
      `nwr["railway"="station"]`,
      `nwr["public_transport"="platform"]`,
      `nwr["public_transport"="station"]`
    );

  return out;
}

async function overpassQuery(query: string): Promise<any[]> {
  const url = 'https://overpass-api.de/api/interpreter';
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // Be a good citizen for public Overpass instances.
      'User-Agent': 'CareZoom/1.0 (care map MVP)',
    },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`Overpass failed (${r.status}): ${text}`);
  }
  const data = (await r.json()) as { elements?: any[] };
  return data.elements ?? [];
}

export async function getNearbyPlaces(
  lat: number,
  lng: number,
  radiusM: number,
  types: CareMapPlaceType[]
): Promise<CareMapPlace[]> {
  const filters = overpassFiltersForTypes(types);
  if (!filters.length) return [];

  const around = `(around:${Math.max(100, Math.min(radiusM, 50_000))},${lat},${lng})`;
  const body = filters.map((f) => `${f}${around};`).join('\n');
  const query = `[out:json][timeout:15];
(
${body}
);
out center tags;`;

  const elements = await overpassQuery(query);
  const results: CareMapPlace[] = [];
  for (const el of elements) {
    const cLat = el.lat ?? el.center?.lat;
    const cLng = el.lon ?? el.center?.lon;
    if (typeof cLat !== 'number' || typeof cLng !== 'number') continue;
    const tags = (el.tags ?? {}) as Record<string, any>;
    const name = cleanStr(tags.name) ?? 'Care option';
    const phone = cleanStr(tags.phone ?? tags['contact:phone']);
    const website = cleanStr(tags.website ?? tags['contact:website']);
    const address = buildAddress(tags);
    const specialties = parseSpecialties(tags);
    const type = inferType(tags);
    if (!types.includes(type)) continue;
    results.push({
      id: `${el.type ?? 'nwr'}/${el.id ?? name}-${Math.round(cLat * 1e5)}-${Math.round(cLng * 1e5)}`,
      name,
      type,
      lat: cLat,
      lng: cLng,
      address,
      phone,
      website,
      specialties,
    });
  }

  // Deduplicate roughly by (name + type + rounded location).
  const seen = new Set<string>();
  const deduped: CareMapPlace[] = [];
  for (const p of results) {
    const k = `${p.type}|${p.name.toLowerCase()}|${Math.round(p.lat * 1e4)}|${Math.round(p.lng * 1e4)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(p);
  }
  return deduped;
}


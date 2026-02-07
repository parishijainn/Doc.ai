export type CareMapPlaceType = 'hospital' | 'urgent_care' | 'primary_care' | 'specialist' | 'pharmacy';

export type CareMapPlace = {
  id: string;
  type: CareMapPlaceType;
  name: string;
  lat: number;
  lng: number;
  address?: string;
  phone?: string;
  website?: string;
  specialties?: string[];
  // Optional seeded fields (capacityTable may fill these)
  capacity?: { status: 'green' | 'yellow' | 'red'; acceptingPatients: boolean; note?: string };
};

function n(n: any): number | null {
  const x = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(x) ? x : null;
}

function pickAddress(tags: Record<string, any>): string | undefined {
  const parts = [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:city'],
    tags['addr:state'],
    tags['addr:postcode'],
  ].filter(Boolean);
  const s = parts.join(' ').trim();
  return s || tags['addr:full'] || tags.address || undefined;
}

function typeToOverpassFilters(type: CareMapPlaceType): string[] {
  switch (type) {
    case 'hospital':
      return ['amenity=hospital', 'amenity=clinic'];
    case 'urgent_care':
      return ['healthcare=urgent_care', 'amenity=clinic'];
    case 'primary_care':
      return ['healthcare=doctor', 'amenity=doctors'];
    case 'specialist':
      return ['healthcare=specialist'];
    case 'pharmacy':
      return ['amenity=pharmacy'];
    default:
      return ['amenity=clinic'];
  }
}

async function overpass(query: string): Promise<any> {
  const overpassUrl = 'https://overpass-api.de/api/interpreter';
  const res = await fetch(overpassUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Overpass failed (${res.status}): ${JSON.stringify(data).slice(0, 500)}`);
  }
  return data;
}

export async function getNearbyPlaces(
  lat: number,
  lng: number,
  radiusM: number,
  types: CareMapPlaceType[]
): Promise<CareMapPlace[]> {
  const ts = (types?.length ? types : (['hospital'] as CareMapPlaceType[])).slice(0, 8);

  const orParts = ts
    .flatMap((t) => typeToOverpassFilters(t).map((f) => ({ t, f })))
    .map(({ f }) => `nwr[${f}](around:${radiusM},${lat},${lng});`)
    .join('\n');

  const query = `[out:json][timeout:15];
(
${orParts}
);
out center tags;`;

  try {
    const data = await overpass(query);
    const elements = Array.isArray(data?.elements) ? data.elements : [];

    const out: CareMapPlace[] = elements
      .map((el: any) => {
        const tags: Record<string, any> = el.tags ?? {};
        const cLat = n(el.lat ?? el.center?.lat);
        const cLng = n(el.lon ?? el.center?.lon);
        if (cLat == null || cLng == null) return null;

        // Best-effort type inference
        const isPharmacy = tags.amenity === 'pharmacy';
        const isHospital = tags.amenity === 'hospital';
        const isUrgent = tags.healthcare === 'urgent_care';
        const isDoctor = tags.amenity === 'doctors' || tags.healthcare === 'doctor';
        const inferred: CareMapPlaceType =
          isHospital ? 'hospital' : isUrgent ? 'urgent_care' : isPharmacy ? 'pharmacy' : isDoctor ? 'primary_care' : 'specialist';

        const id = `${el.type ?? 'nwr'}-${String(el.id ?? '')}`;
        return {
          id,
          type: inferred,
          name: String(tags.name ?? 'Care option'),
          lat: cLat,
          lng: cLng,
          address: pickAddress(tags),
          phone: tags.phone ?? tags['contact:phone'] ?? undefined,
          website: tags.website ?? tags['contact:website'] ?? undefined,
          specialties: tags['healthcare:speciality']
            ? String(tags['healthcare:speciality'])
                .split(/[;,]/)
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
        } satisfies CareMapPlace;
      })
      .filter(Boolean) as CareMapPlace[];

    // De-dupe by name+coords
    const seen = new Set<string>();
    const deduped: CareMapPlace[] = [];
    for (const p of out) {
      const k = `${p.name.toLowerCase()}@${Math.round(p.lat * 1e4)}/${Math.round(p.lng * 1e4)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(p);
    }
    return deduped.slice(0, 60);
  } catch {
    // MVP: return empty on failure (frontend has graceful copy)
    return [];
  }
}


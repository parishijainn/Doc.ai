export type CapacityStatus = 'green' | 'yellow' | 'red';

export type HospitalCapacity = {
  status: CapacityStatus;
  bedsOpen: number;
  acceptingPatients: boolean;
  updatedAt: string;
};

export type HospitalSeed = {
  id: string;
  name: string;
  specialties: string[];
  capacity: HospitalCapacity;
  phone?: string;
  website?: string;
};

function norm(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const now = () => new Date().toISOString();

// Demo capacity/specialty table (seeded for Pittsburgh).
// Real capacity data typically requires hospital feeds; this is MVP demo data.
const SEEDED_HOSPITALS: HospitalSeed[] = [
  {
    id: 'upmc-presbyterian',
    name: 'UPMC Presbyterian',
    specialties: ['emergency', 'cardiology', 'orthopedics', 'neurology', 'pulmonology', 'gastroenterology'],
    capacity: { status: 'yellow', bedsOpen: 12, acceptingPatients: true, updatedAt: now() },
    website: 'https://www.upmc.com/locations/hospitals/presbyterian',
  },
  {
    id: 'upmc-mercy',
    name: 'UPMC Mercy',
    specialties: ['emergency', 'cardiology', 'neurology', 'orthopedics'],
    capacity: { status: 'green', bedsOpen: 24, acceptingPatients: true, updatedAt: now() },
    website: 'https://www.upmc.com/locations/hospitals/mercy',
  },
  {
    id: 'allegheny-general',
    name: 'Allegheny General Hospital',
    specialties: ['emergency', 'cardiology', 'orthopedics', 'neurology'],
    capacity: { status: 'red', bedsOpen: 3, acceptingPatients: false, updatedAt: now() },
    website: 'https://www.ahn.org/locations/hospitals/allegheny-general',
  },
  {
    id: 'upmc-shadyside',
    name: 'UPMC Shadyside',
    specialties: ['emergency', 'cardiology', 'dermatology', 'gastroenterology', 'pulmonology'],
    capacity: { status: 'yellow', bedsOpen: 9, acceptingPatients: true, updatedAt: now() },
    website: 'https://www.upmc.com/locations/hospitals/shadyside',
  },
];

const INDEX = new Map<string, HospitalSeed>();
for (const h of SEEDED_HOSPITALS) INDEX.set(norm(h.name), h);

function fuzzyLookupByName(name: string): HospitalSeed | undefined {
  const n = norm(name);
  if (!n) return undefined;
  if (INDEX.has(n)) return INDEX.get(n);
  // Fuzzy includes match for real-world OSM naming differences.
  for (const h of SEEDED_HOSPITALS) {
    const hn = norm(h.name);
    if (n.includes(hn) || hn.includes(n)) return h;
  }
  return undefined;
}

export function getHospitalSeedByName(name: string): HospitalSeed | undefined {
  return fuzzyLookupByName(name);
}

export function capacityScore(status: CapacityStatus, acceptingPatients: boolean): number {
  if (!acceptingPatients) return 0.05;
  if (status === 'green') return 1.0;
  if (status === 'yellow') return 0.6;
  return 0.2;
}


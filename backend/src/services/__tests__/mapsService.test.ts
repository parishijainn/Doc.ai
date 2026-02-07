import { getNearbyProviders, getRoute } from '../mapsService';

describe('mapsService', () => {
  it('returns providers for lat/lng', async () => {
    const providers = await getNearbyProviders(40.44, -79.94);
    expect(Array.isArray(providers)).toBe(true);
    expect(providers.length).toBeGreaterThan(0);
    expect(providers[0]).toMatchObject({
      name: expect.any(String),
      type: expect.any(String),
      address: expect.any(String),
      lat: expect.any(Number),
      lng: expect.any(Number),
    });
  });

  it('filters by type when provided', async () => {
    const providers = await getNearbyProviders(40.44, -79.94, 'dermatology');
    expect(providers.every((p) => p.type === 'dermatology')).toBe(true);
  });

  it('returns route with distance and duration', async () => {
    const route = await getRoute(40.44, -79.94, 40.45, -79.95, 'driving');
    expect(route.from).toEqual({ lat: 40.44, lng: -79.94 });
    expect(route.to).toEqual({ lat: 40.45, lng: -79.95 });
    expect(route.distanceKm).toBeGreaterThanOrEqual(0);
    expect(route.durationMinutes).toBeGreaterThanOrEqual(0);
    expect(route.mode).toBe('driving');
  });

  it('returns walking route when mode is walking', async () => {
    const route = await getRoute(40.44, -79.94, 40.45, -79.95, 'walking');
    expect(route.mode).toBe('walking');
  });
});

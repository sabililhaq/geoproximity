import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearRouteCache,
  distanceKm,
  formatDistance,
  formatDuration,
  geodesicLatLngs,
  samePlace,
  withDistance,
  withNetworkDistance,
  withNetworkMatrix,
  getNetworkDistance,
} from '../src/geo';

const paris = { lat: 48.8566, lon: 2.3522 };
const london = { lat: 51.5074, lon: -0.1278 };
const nyc = { lat: 40.7128, lon: -74.006 };

describe('distanceKm', () => {
  it('is zero for the same point', () => {
    expect(distanceKm(paris, paris)).toBe(0);
  });

  it('measures Paris to London around 344 km', () => {
    expect(distanceKm(paris, london)).toBeGreaterThan(330);
    expect(distanceKm(paris, london)).toBeLessThan(360);
  });

  it('measures New York to London around 5,570 km', () => {
    const km = distanceKm(nyc, london);
    expect(km).toBeGreaterThan(5400);
    expect(km).toBeLessThan(5700);
  });
});

describe('formatDistance', () => {
  it('uses two decimals under 1', () => {
    expect(formatDistance(0.4)).toBe('0.40 km');
  });

  it('uses one decimal under 100', () => {
    expect(formatDistance(12.34)).toBe('12.3 km');
  });

  it('rounds larger distances', () => {
    expect(formatDistance(1200)).toBe('1,200 km');
  });
});

describe('geodesicLatLngs', () => {
  it('bulges north of the Mercator chord from New York to London', () => {
    const line = geodesicLatLngs(nyc, london);
    expect(line.length).toBeGreaterThan(8);
    const maxLat = Math.max(...line.map(([lat]) => lat));
    expect(maxLat).toBeGreaterThan(Math.max(nyc.lat, london.lat));
  });
});

describe('formatDuration', () => {
  it('formats seconds as minutes and hours', () => {
    expect(formatDuration(12)).toBe('< 1 min');
    expect(formatDuration(60)).toBe('1 min');
    expect(formatDuration(12.5 * 60)).toBe('13 min');
    expect(formatDuration(3600)).toBe('1 h');
    expect(formatDuration(3660)).toBe('1 h 1 min');
  });
});

describe('samePlace / withDistance', () => {
  it('treats nearby coordinates as the same place', () => {
    expect(samePlace(paris, { lat: 48.85665, lon: 2.35222 })).toBe(true);
    expect(samePlace(paris, london)).toBe(false);
  });

  it('ranks locations by distance to the destination', () => {
    const ranked = withDistance(
      [
        { id: 'nyc', ...nyc },
        { id: 'london', ...london },
      ],
      paris,
    );
    expect(ranked.map((item) => item.id)).toEqual(['london', 'nyc']);
    expect(ranked[0]!.km).toBeLessThan(ranked[1]!.km);
  });
});

describe('withNetworkDistance', () => {
  afterEach(() => {
    clearRouteCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('flags a missing route and falls back to straight-line distance', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ code: 'NoRoute' }), { status: 200 })),
    );
    const ranked = await withNetworkDistance([{ id: 'london', ...london }], paris);
    expect(ranked[0]!.error).toBe('no_route');
    expect(ranked[0]!.geometry).toBeUndefined();
    expect(ranked[0]!.km).toBeCloseTo(distanceKm(london, paris), 6);
  });

  it('flags network failures per item and keeps successful routes intact', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes(`${london.lon},${london.lat}`)) throw new TypeError('Failed to fetch');
        return new Response(
          JSON.stringify({
            code: 'Ok',
            routes: [
              {
                distance: 6_000_000,
                duration: 216_000,
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [nyc.lon, nyc.lat],
                    [paris.lon, paris.lat],
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        );
      }),
    );
    const ranked = await withNetworkDistance(
      [
        { id: 'nyc', ...nyc },
        { id: 'london', ...london },
      ],
      paris,
    );
    const byId = Object.fromEntries(ranked.map((item) => [item.id, item]));
    expect(byId.london!.error).toBe('network');
    expect(byId.london!.km).toBeCloseTo(distanceKm(london, paris), 6);
    expect(byId.nyc!.error).toBeUndefined();
    expect(byId.nyc!.km).toBe(6000);
    expect(byId.nyc!.durationSec).toBe(216_000);
    expect(byId.nyc!.geometry).toHaveLength(2);
  });

  it('reuses a cached route for the same mode and pair', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/table/')) {
        return new Response(
          JSON.stringify({
            code: 'Ok',
            distances: [[1000]],
            durations: [[120]],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          code: 'Ok',
          routes: [
            { distance: 1000, duration: 120, geometry: { type: 'LineString', coordinates: [] } },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await withNetworkDistance([{ id: 'london', ...london }], paris, 'driving');
    await withNetworkDistance([{ id: 'london', ...london }], paris, 'driving');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await withNetworkDistance([{ id: 'london', ...london }], paris, 'walking');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ranks N locations with one table request', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(String(url)).toContain('/table/v1/driving/');
      expect(String(url)).toContain('annotations=duration,distance');
      return new Response(
        JSON.stringify({
          code: 'Ok',
          distances: [[344_000], [5_850_000]],
          durations: [[14_400], [216_000]],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const ranked = await withNetworkDistance(
      [
        { id: 'london', ...london },
        { id: 'nyc', ...nyc },
      ],
      paris,
      'driving',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ranked.map((item) => item.id)).toEqual(['london', 'nyc']);
    expect(ranked[0]!.km).toBe(344);
    expect(ranked[0]!.durationSec).toBe(14_400);
    expect(ranked[0]!.geometry).toBeUndefined();
  });
});

describe('pedestrian routing', () => {
  afterEach(() => {
    clearRouteCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses the foot backend for matrices, single-destination tables, and route geometry', async () => {
    const calls: URL[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      calls.push(new URL(url));
      return new Response(
        JSON.stringify(
          url.includes('/table/')
            ? { code: 'Ok', distances: [[5000]], durations: [[3600]] }
            : {
                code: 'Ok',
                routes: [
                  {
                    distance: 5000,
                    duration: 3600,
                    geometry: {
                      coordinates: [
                        [2, 48],
                        [3, 49],
                      ],
                    },
                  },
                ],
              },
        ),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const matrix = await withNetworkMatrix(
      [{ id: 'a', ...paris }],
      [{ id: 'b', ...london }],
      'walking',
    );
    expect(matrix.get('a|b')?.durationSec).toBe(3600);
    const route = await getNetworkDistance(paris, london, 'walking');
    expect(route.geometry).toHaveLength(2);
    await withNetworkDistance([paris], nyc, 'walking');
    expect(calls).toHaveLength(3);
    for (const url of calls) {
      expect(url.origin).toBe('https://routing.openstreetmap.de');
      expect(url.pathname).toMatch(/^\/routed-foot\/(route|table)\/v1\/foot\//);
    }
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchPlaces } from '../src/geocoder';

describe('searchPlaces', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('biases Nominatim toward the map with a viewbox', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(String(url)).toContain('nominatim.openstreetmap.org/search');
      expect(String(url)).toContain('viewbox=');
      expect(String(url)).toContain('bounded=0');
      return new Response(
        JSON.stringify([
          {
            display_name: 'Warunk Upnormal, Bandung',
            name: 'Warunk Upnormal',
            lat: '-6.9022',
            lon: '107.6044',
          },
        ]),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchPlaces('Warunk Upnormal', {
      bias: { lat: -6.92, lon: 107.61 },
    });
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]!.shortName).toBe('Warunk Upnormal');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('passes lat/lon to Photon when Nominatim is empty', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('nominatim')) {
        return new Response('[]', { status: 200 });
      }
      expect(String(url)).toContain('photon.komoot.io');
      expect(String(url)).toContain('lat=-6.92');
      expect(String(url)).toContain('lon=107.61');
      return new Response(JSON.stringify({ features: [] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await searchPlaces('Warunk Upnormal', {
      bias: { lat: -6.92, lon: 107.61 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeShareHash, readShareHash, readStoredState, writeStoredState } from '../src/share';

const destination = {
  id: 'destination-id',
  name: 'Paris',
  lat: 48.8566,
  lon: 2.3522,
};

const state = {
  destination,
  origins: [destination],
  locations: [{ id: 'location-id', name: 'London', lat: 51.5074, lon: -0.1278 }],
  distanceMode: 'straight' as const,
};

describe('share hash', () => {
  it('round-trips a comparison without ids', () => {
    const result = readShareHash(`#${encodeShareHash(state)}`);

    expect(result).toEqual({
      destination: { name: 'Paris', lat: 48.8566, lon: 2.3522 },
      locations: [{ name: 'London', lat: 51.5074, lon: -0.1278 }],
      distanceMode: 'straight',
    });
  });

  it('round-trips the distance mode and ignores unknown modes', () => {
    const driving = readShareHash(`#${encodeShareHash({ ...state, distanceMode: 'driving' })}`);
    expect(driving?.distanceMode).toBe('driving');

    const bogus = readShareHash(
      `#proximity=${encodeURIComponent(
        JSON.stringify({ destination: null, locations: [], mode: 'teleport' }),
      )}`,
    );
    expect(bogus).toEqual({ destination: null, locations: [] });
  });

  it('rejects malformed or invalid hashes', () => {
    expect(readShareHash('')).toBeNull();
    expect(readShareHash('#nonsense')).toBeNull();
    expect(readShareHash('#proximity=not-json')).toBeNull();
    expect(
      readShareHash(
        `#proximity=${encodeURIComponent(JSON.stringify({ destination: { name: 'Bad', lat: 91, lon: 0 } }))}`,
      ),
    ).toBeNull();
    expect(readShareHash('#px=91,0,Bad||')).toBeNull();
  });

  it('keeps names with commas and stays shorter than JSON hashes', () => {
    const named = {
      ...state,
      destination: { ...state.destination, name: 'Paris, France' },
    };
    const compact = encodeShareHash(named);
    expect(compact.startsWith('px=')).toBe(true);
    expect(readShareHash(`#${compact}`)?.destination?.name).toBe('Paris, France');

    const json = `proximity=${encodeURIComponent(
      JSON.stringify({
        destination: { name: 'Paris, France', lat: 48.8566, lon: 2.3522 },
        locations: [{ name: 'London', lat: 51.5074, lon: -0.1278 }],
        mode: 'straight',
      }),
    )}`;
    expect(compact.length).toBeLessThan(json.length);
  });

  it('round-trips several people with px2 hashes and keeps old px hashes', () => {
    const group = {
      destination: state.destination,
      origins: [state.destination, { id: 'lyon-id', name: 'Lyon', lat: 45.764, lon: 4.8357 }],
      locations: state.locations,
      distanceMode: 'straight' as const,
    };
    const compact = encodeShareHash(group);
    expect(compact.startsWith('px2=')).toBe(true);
    expect(readShareHash(`#${compact}`)).toEqual({
      destination: { name: 'Paris', lat: 48.8566, lon: 2.3522 },
      origins: [
        { name: 'Paris', lat: 48.8566, lon: 2.3522 },
        { name: 'Lyon', lat: 45.764, lon: 4.8357 },
      ],
      locations: [{ name: 'London', lat: 51.5074, lon: -0.1278 }],
      distanceMode: 'straight',
    });

    const solo = encodeShareHash(state);
    expect(solo.startsWith('px=')).toBe(true);
  });

  it('ignores a legacy unit field in shared links', () => {
    const hash = `#proximity=${encodeURIComponent(
      JSON.stringify({ destination: null, locations: [], unit: 'mi' }),
    )}`;

    expect(readShareHash(hash)).toEqual({ destination: null, locations: [] });
  });
});

describe('stored state', () => {
  const memory = new Map<string, string>();
  const stub: Storage = {
    get length() {
      return memory.size;
    },
    clear: () => memory.clear(),
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => {
      memory.set(key, String(value));
    },
    removeItem: (key) => {
      memory.delete(key);
    },
    key: (index) => [...memory.keys()][index] ?? null,
  };

  afterEach(() => {
    memory.clear();
    vi.unstubAllGlobals();
  });

  it('round-trips through localStorage', () => {
    vi.stubGlobal('localStorage', stub);
    writeStoredState(state);
    expect(readStoredState()).toEqual({
      destination: { name: 'Paris', lat: 48.8566, lon: 2.3522 },
      locations: [{ name: 'London', lat: 51.5074, lon: -0.1278 }],
      distanceMode: 'straight',
    });
  });
});

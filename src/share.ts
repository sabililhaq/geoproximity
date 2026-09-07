import { parseProximityJson } from './io';
import type { ProximityNode } from './io';
import type { DistanceMode, ProximityState } from './types';

const DISTANCE_MODES: readonly DistanceMode[] = ['straight', 'driving', 'walking'];

function asDistanceMode(value: unknown): DistanceMode | undefined {
  return DISTANCE_MODES.find((mode) => mode === value);
}

export type SharedComparison = {
  destination: ProximityNode | null;
  locations: ProximityNode[];
  /** Absent in links created before distance modes were shared. */
  distanceMode?: DistanceMode;
};

function compactNum(n: number): string {
  return String(Number(n.toFixed(6)));
}

function encodeNode(node: { name: string; lat: number; lon: number }): string {
  return `${compactNum(node.lat)},${compactNum(node.lon)},${encodeURIComponent(node.name)}`;
}

function parseCompactNode(token: string): ProximityNode | null {
  const first = token.indexOf(',');
  const second = token.indexOf(',', first + 1);
  if (first < 0 || second < 0) return null;
  const lat = Number(token.slice(0, first));
  const lon = Number(token.slice(first + 1, second));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  let name = token.slice(second + 1);
  try {
    name = decodeURIComponent(name);
  } catch {
    /* keep raw */
  }
  name = name.trim() || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  return { name, lat, lon };
}

const MODE_SHORT: Record<DistanceMode, string> = {
  straight: '',
  driving: 'd',
  walking: 'w',
};

export function encodeShareHash(state: ProximityState): string {
  const dest = state.destination ? encodeNode(state.destination) : '';
  const locs = state.locations.map(encodeNode).join(';');
  const mode = MODE_SHORT[state.distanceMode];
  return `px=${dest}|${locs}|${mode}`;
}

function readCompactHash(hash: string): SharedComparison | null {
  const body = hash.slice('#px='.length);
  const parts = body.split('|');
  if (parts.length < 2) return null;
  const destToken = parts[0] ?? '';
  const locToken = parts[1] ?? '';
  const modeToken = parts[2] ?? '';
  const destination = destToken ? parseCompactNode(destToken) : null;
  if (destToken && !destination) return null;
  const locations: ProximityNode[] = [];
  if (locToken) {
    for (const token of locToken.split(';')) {
      const node = parseCompactNode(token);
      if (!node) return null;
      locations.push(node);
    }
  }
  const distanceMode =
    modeToken === 'd'
      ? 'driving'
      : modeToken === 'w'
        ? 'walking'
        : modeToken === ''
          ? 'straight'
          : asDistanceMode(modeToken);
  return distanceMode && distanceMode !== 'straight'
    ? { destination, locations, distanceMode }
    : { destination, locations, distanceMode: distanceMode ?? 'straight' };
}

function readLegacyHash(hash: string): SharedComparison | null {
  try {
    const text = decodeURIComponent(hash.slice('#proximity='.length));
    const result = parseProximityJson(text);
    if (!result.ok) return null;

    let distanceMode: DistanceMode | undefined;
    const raw: unknown = JSON.parse(text);
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      distanceMode = asDistanceMode((raw as { mode?: unknown }).mode);
    }

    return distanceMode ? { ...result.data, distanceMode } : result.data;
  } catch {
    return null;
  }
}

export function readShareHash(hash: string): SharedComparison | null {
  if (hash.startsWith('#px=')) return readCompactHash(hash);
  if (hash.startsWith('#proximity=')) return readLegacyHash(hash);
  return null;
}

export const STORAGE_KEY = 'geoproximity:v1';

function memoryStorage(): Storage | null {
  try {
    const store = globalThis.localStorage;
    return store ?? null;
  } catch {
    return null;
  }
}

export function writeStoredState(state: ProximityState): void {
  try {
    memoryStorage()?.setItem(STORAGE_KEY, encodeShareHash(state));
  } catch {
    /* private mode or quota */
  }
}

export function readStoredState(): SharedComparison | null {
  try {
    const raw = memoryStorage()?.getItem(STORAGE_KEY);
    if (raw == null) return null;
    return readShareHash(`#${raw}`);
  } catch {
    return null;
  }
}

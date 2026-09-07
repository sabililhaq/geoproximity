import { parseProximityJson } from "./io";
import type { ProximityNode } from "./io";
import type { DistanceMode, ProximityState } from "./types";

const DISTANCE_MODES: readonly DistanceMode[] = ["straight", "driving", "walking"];

function asDistanceMode(value: unknown): DistanceMode | undefined {
  return DISTANCE_MODES.find((mode) => mode === value);
}

export type SharedComparison = {
  destination: ProximityNode | null;
  locations: ProximityNode[];
  /** Absent in links created before distance modes were shared. */
  distanceMode?: DistanceMode;
};

export function encodeShareHash(state: ProximityState): string {
  return `proximity=${encodeURIComponent(
    JSON.stringify({
      destination: state.destination
        ? {
            name: state.destination.name,
            lat: state.destination.lat,
            lon: state.destination.lon,
          }
        : null,
      locations: state.locations.map((place) => ({
        name: place.name,
        lat: place.lat,
        lon: place.lon,
      })),
      mode: state.distanceMode,
    }),
  )}`;
}

export function readShareHash(hash: string): SharedComparison | null {
  const prefix = "#proximity=";
  if (!hash.startsWith(prefix)) return null;

  try {
    const text = decodeURIComponent(hash.slice(prefix.length));
    const result = parseProximityJson(text);
    if (!result.ok) return null;

    let distanceMode: DistanceMode | undefined;
    const raw: unknown = JSON.parse(text);
    if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
      distanceMode = asDistanceMode((raw as { mode?: unknown }).mode);
    }

    return distanceMode ? { ...result.data, distanceMode } : result.data;
  } catch {
    return null;
  }
}

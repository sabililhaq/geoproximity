import { parseProximityJson } from "./io";
import type { ProximityNode } from "./io";
import type { ProximityState } from "./types";

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
    }),
  )}`;
}

export function readShareHash(hash: string): {
  destination: ProximityNode | null;
  locations: ProximityNode[];
} | null {
  const prefix = "#proximity=";
  if (!hash.startsWith(prefix)) return null;

  try {
    const text = decodeURIComponent(hash.slice(prefix.length));
    const result = parseProximityJson(text);
    if (!result.ok) return null;
    return result.data;
  } catch {
    return null;
  }
}

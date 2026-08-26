import { parseProximityJson } from "./io";
import type { ProximityNode } from "./io";
import type { Place, ProximityState, ProximityUnit } from "./types";

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
      unit: state.unit,
    }),
  )}`;
}

export function readShareHash(hash: string): {
  destination: ProximityNode | null;
  locations: ProximityNode[];
  unit: ProximityUnit;
} | null {
  const prefix = "#proximity=";
  if (!hash.startsWith(prefix)) return null;

  try {
    const text = decodeURIComponent(hash.slice(prefix.length));
    const raw: unknown = JSON.parse(text);
    const result = parseProximityJson(text);
    if (!result.ok) return null;

    const unit =
      typeof raw === "object" &&
      raw !== null &&
      "unit" in raw &&
      raw.unit === "mi"
        ? "mi"
        : "km";
    return { ...result.data, unit };
  } catch {
    return null;
  }
}

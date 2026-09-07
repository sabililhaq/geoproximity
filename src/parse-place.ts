export type ParsedCoords = {
  lat: number;
  lon: number;
};

function finitePair(lat: number, lon: number): ParsedCoords | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

/** Bare `lat, lon` (or `lat lon`) as the whole input. */
export function parseCoordinates(input: string): ParsedCoords | null {
  const match = input.trim().match(/^([+-]?\d+(?:\.\d+)?)(?:\s*,\s*|\s+)([+-]?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  return finitePair(parseFloat(match[1]!), parseFloat(match[2]!));
}

/** Pull `@lat,lon` or `q=lat,lon` out of a Google Maps URL. */
export function parseMapsUrl(input: string): ParsedCoords | null {
  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  if (
    !/google\.[^/]+\/maps|maps\.google\./i.test(trimmed) &&
    !/maps\.app\.goo\.gl/i.test(trimmed)
  ) {
    // Still accept any URL that embeds @lat,lon — Maps share links vary by locale.
    const at = trimmed.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (at) return finitePair(parseFloat(at[1]!), parseFloat(at[2]!));
    return null;
  }

  const at = trimmed.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at) return finitePair(parseFloat(at[1]!), parseFloat(at[2]!));

  try {
    const url = new URL(trimmed);
    for (const key of ['q', 'query', 'destination', 'll']) {
      const value = url.searchParams.get(key);
      if (!value) continue;
      const pair = parseCoordinates(value);
      if (pair) return pair;
    }
  } catch {
    return null;
  }
  return null;
}

export function parsePlaceInput(input: string): ParsedCoords | null {
  return parseCoordinates(input) ?? parseMapsUrl(input);
}

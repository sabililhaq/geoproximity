export type RouteDirection = 'to-places' | 'from-places';

export type DistanceMode = 'straight' | 'driving' | 'walking';

export type Place = {
  id: string;
  name: string;
  lat: number;
  lon: number;
};

export type ProximityState = {
  /** First origin; kept so existing getState/setState callers keep working. */
  destination: Place | null;
  /** Starting points (people). Empty means no ranking yet. */
  origins: Place[];
  locations: Place[];
  distanceMode: DistanceMode;
  /** Defaults to people → places for existing callers. */
  routeDirection?: RouteDirection;
};

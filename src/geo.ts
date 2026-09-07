export type Coord = {
	lat: number;
	lon: number;
};

const EARTH_KM = 6371;

export function distanceKm(a: Coord, b: Coord): number {
	const lat1 = (a.lat * Math.PI) / 180;
	const lat2 = (b.lat * Math.PI) / 180;
	const dLat = lat2 - lat1;
	const dLon = ((b.lon - a.lon) * Math.PI) / 180;
	const h =
		Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(km: number): string {
	if (km < 1) return `${km.toFixed(2)} km`;
	if (km < 100) return `${km.toFixed(1)} km`;
	return `${Math.round(km).toLocaleString('en-US')} km`;
}

/** OSRM returns duration in seconds. */
export function formatDuration(sec: number): string {
	if (!Number.isFinite(sec) || sec < 0) return '—';
	if (sec < 60) return '< 1 min';
	const minutes = Math.round(sec / 60);
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function samePlace(a: Coord, b: Coord, eps = 1e-4): boolean {
	return Math.abs(a.lat - b.lat) < eps && Math.abs(a.lon - b.lon) < eps;
}

export function withDistance<T extends Coord>(
	items: T[],
	destination: Coord,
): Array<T & { km: number }> {
	return items
		.map((item) => ({ ...item, km: distanceKm(item, destination) }))
		.sort((a, b) => a.km - b.km);
}

export type RouteError = 'network' | 'no_route' | 'unknown';

export type RouteResult = {
	km: number;
	/** Travel time in seconds when the router returned one. */
	durationSec?: number;
	geometry?: Array<[number, number]>;
	/** Set when routing failed and `km` is a straight-line fallback. */
	error?: RouteError;
};

export async function getNetworkDistance(
	a: Coord,
	b: Coord,
	mode: 'driving' | 'walking' = 'driving',
	signal?: AbortSignal,
): Promise<RouteResult> {
	try {
		const url = `https://router.project-osrm.org/route/v1/${mode}/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`;
		let response: Response;
		try {
			response = await fetch(url, { signal });
		} catch (err) {
			console.warn('Network error reaching OSRM:', err);
			return { km: distanceKm(a, b), error: 'network' };
		}

		if (!response.ok) {
			console.warn(`OSRM HTTP error: ${response.status}`);
			return { km: distanceKm(a, b), error: 'network' };
		}

		const data = await response.json() as {
			routes?: Array<{
				distance: number;
				duration?: number;
				geometry?: { type: string; coordinates: Array<[number, number]> };
			}>;
			code?: string;
		};

		if (data.code !== 'Ok') {
			console.warn(`OSRM error code: ${data.code}`);
			return { km: distanceKm(a, b), error: 'no_route' };
		}

		if (!data.routes?.[0]) {
			console.warn('OSRM returned no routes');
			return { km: distanceKm(a, b), error: 'no_route' };
		}

		const route = data.routes[0];
		const durationSec =
			typeof route.duration === 'number' && Number.isFinite(route.duration)
				? route.duration
				: undefined;
		return {
			km: route.distance / 1000,
			durationSec,
			geometry: route.geometry?.coordinates,
		};
	} catch (error) {
		console.warn('Unexpected error during routing:', error);
		return { km: distanceKm(a, b), error: 'unknown' };
	}
}

export async function withNetworkDistance<T extends Coord>(
	items: T[],
	destination: Coord,
	mode: 'driving' | 'walking' = 'driving',
	signal?: AbortSignal,
): Promise<
	Array<T & { km: number; durationSec?: number; geometry?: Array<[number, number]>; error?: RouteError }>
> {
	const routes = await Promise.all(
		items.map((item) => getNetworkDistance(item, destination, mode, signal)),
	);
	return items
		.map((item, i) => ({
			...item,
			km: routes[i].km,
			durationSec: routes[i].durationSec,
			geometry: routes[i].geometry,
			error: routes[i].error,
		}))
		.sort((a, b) => a.km - b.km);
}

export type Coord = {
	lat: number;
	lon: number;
};

const EARTH_KM = 6371;
const KM_TO_MI = 0.621371192;

export function distanceKm(a: Coord, b: Coord): number {
	const lat1 = (a.lat * Math.PI) / 180;
	const lat2 = (b.lat * Math.PI) / 180;
	const dLat = lat2 - lat1;
	const dLon = ((b.lon - a.lon) * Math.PI) / 180;
	const h =
		Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function kmToMi(km: number): number {
	return km * KM_TO_MI;
}

export function formatDistance(km: number, unit: 'km' | 'mi'): string {
	const value = unit === 'mi' ? kmToMi(km) : km;
	const label = unit === 'mi' ? 'mi' : 'km';
	if (value < 1) return `${value.toFixed(2)} ${label}`;
	if (value < 100) return `${value.toFixed(1)} ${label}`;
	return `${Math.round(value).toLocaleString('en-US')} ${label}`;
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

export type RouteResult = {
	km: number;
	geometry?: Array<[number, number]>;
};

export async function getNetworkDistance(
	a: Coord,
	b: Coord,
	mode: 'driving' | 'walking' = 'driving',
	signal?: AbortSignal,
): Promise<RouteResult> {
	try {
		const url = `https://router.project-osrm.org/route/v1/${mode}/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`;
		const response = await fetch(url, { signal });
		if (!response.ok) throw new Error(`OSRM error: ${response.status}`);
		const data = await response.json() as {
			routes?: Array<{
				distance: number;
				geometry?: { type: string; coordinates: Array<[number, number]> };
			}>;
			code?: string;
		};
		if (data.code !== 'Ok' || !data.routes?.[0]) {
			throw new Error(`No route found`);
		}
		const route = data.routes[0];
		return {
			km: route.distance / 1000,
			geometry: route.geometry?.coordinates,
		};
	} catch (error) {
		console.warn(`Network distance failed, falling back to great-circle:`, error);
		return { km: distanceKm(a, b) };
	}
}

export async function withNetworkDistance<T extends Coord>(
	items: T[],
	destination: Coord,
	mode: 'driving' | 'walking' = 'driving',
	signal?: AbortSignal,
): Promise<Array<T & { km: number; geometry?: Array<[number, number]> }>> {
	const routes = await Promise.all(
		items.map((item) => getNetworkDistance(item, destination, mode, signal)),
	);
	return items
		.map((item, i) => ({ ...item, km: routes[i].km, geometry: routes[i].geometry }))
		.sort((a, b) => a.km - b.km);
}

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

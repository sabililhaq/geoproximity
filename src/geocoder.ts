export type GeocodeHit = {
	name: string;
	shortName: string;
	lat: number;
	lon: number;
};

type SearchOptions = {
	limit?: number;
	signal?: AbortSignal;
};

type NominatimHit = {
	display_name?: string;
	lat?: string;
	lon?: string;
	name?: string;
};

type PhotonFeature = {
	geometry?: { coordinates?: number[] };
	properties?: {
		name?: string;
		country?: string;
		city?: string;
		street?: string;
		state?: string;
	};
};

function isAbortError(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'AbortError';
}

function finiteCoord(value: string | number | undefined): number | null {
	const n = typeof value === 'number' ? value : parseFloat(value ?? '');
	return Number.isFinite(n) ? n : null;
}

function formatCoords(lat: number, lon: number): string {
	return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

async function searchNominatim(
	query: string,
	limit: number,
	signal?: AbortSignal,
): Promise<GeocodeHit[]> {
	const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=${limit}&addressdetails=1`;
	const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
	if (!response.ok) throw new Error(`Nominatim ${response.status}`);
	const data: unknown = await response.json();
	if (!Array.isArray(data)) return [];

	return data.flatMap((item: NominatimHit) => {
		const lat = finiteCoord(item.lat);
		const lon = finiteCoord(item.lon);
		if (lat === null || lon === null) return [];
		const name = item.display_name || item.name || query;
		return [
			{
				name,
				shortName: item.name || name.split(',')[0] || name,
				lat,
				lon,
			},
		];
	});
}

async function searchPhoton(
	query: string,
	limit: number,
	signal?: AbortSignal,
): Promise<GeocodeHit[]> {
	const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=${limit}`;
	const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
	if (!response.ok) throw new Error(`Photon ${response.status}`);
	const data: { features?: PhotonFeature[] } = await response.json();
	const features = Array.isArray(data.features) ? data.features : [];

	return features.flatMap((feature) => {
		const coords = feature.geometry?.coordinates;
		const lon = finiteCoord(coords?.[0]);
		const lat = finiteCoord(coords?.[1]);
		if (lat === null || lon === null) return [];
		const props = feature.properties || {};
		const shortName = props.name || props.city || props.street || query;
		const parts = [props.name, props.city, props.state, props.country].filter(Boolean);
		return [
			{
				name: [...new Set(parts)].join(', ') || shortName,
				shortName,
				lat,
				lon,
			},
		];
	});
}

export type GeocodeSearch = {
	hits: GeocodeHit[];
	/** True when every geocoding provider failed, so an empty result is not "no such place". */
	unavailable: boolean;
};

export async function searchPlaces(query: string, opts: SearchOptions = {}): Promise<GeocodeSearch> {
	const none: GeocodeSearch = { hits: [], unavailable: false };
	if (!query || query.length < 2) return none;
	const { limit = 8, signal } = opts;

	let nominatimFailed = false;
	try {
		const hits = await searchNominatim(query, limit, signal);
		if (hits.length > 0) return { hits, unavailable: false };
	} catch (error) {
		if (isAbortError(error)) return none;
		nominatimFailed = true;
	}

	try {
		const hits = await searchPhoton(query, limit, signal);
		return { hits, unavailable: false };
	} catch (error) {
		if (isAbortError(error)) return none;
		console.warn('Geocoding error:', error);
		return { hits: [], unavailable: nominatimFailed };
	}
}

export async function searchLocation(query: string, opts: SearchOptions = {}): Promise<GeocodeHit[]> {
	return (await searchPlaces(query, opts)).hits;
}

export async function reverseGeocode(
	lat: number,
	lon: number,
	signal?: AbortSignal,
): Promise<string> {
	const fallback = formatCoords(lat, lon);
	try {
		const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
		const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
		if (response.ok) {
			const data: NominatimHit = await response.json();
			if (data.name) return data.name;
			if (data.display_name) return data.display_name.split(',')[0] || fallback;
		}
	} catch (error) {
		if (isAbortError(error)) return fallback;
	}

	try {
		const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`;
		const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
		if (!response.ok) return fallback;
		const data: { features?: PhotonFeature[] } = await response.json();
		const name = data.features?.[0]?.properties?.name;
		return name || fallback;
	} catch (error) {
		if (isAbortError(error)) return fallback;
		return fallback;
	}
}

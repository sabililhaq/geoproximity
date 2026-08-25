export type ProximityNode = {
	name: string;
	lat: number;
	lon: number;
};

export type ProximityFile = {
	destination: ProximityNode | null;
	locations: ProximityNode[];
};

export type ParseResult =
	| { ok: true; data: ProximityFile }
	| { ok: false; error: string };

function asNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim() !== '') {
		const n = Number(value);
		if (Number.isFinite(n)) return n;
	}
	return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readLat(obj: Record<string, unknown>): number | null {
	return asNumber(obj.lat) ?? asNumber(obj.latitude);
}

function readLon(obj: Record<string, unknown>): number | null {
	return asNumber(obj.lon) ?? asNumber(obj.lng) ?? asNumber(obj.longitude) ?? asNumber(obj.long);
}

function readName(obj: Record<string, unknown>, lat: number, lon: number): string {
	if (typeof obj.name === 'string' && obj.name.trim()) return obj.name.trim();
	return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

function parseNode(value: unknown): ProximityNode | null {
	if (!isRecord(value)) return null;
	const lat = readLat(value);
	const lon = readLon(value);
	if (lat === null || lon === null) return null;
	if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
	return { name: readName(value, lat, lon), lat, lon };
}

function isDestinationNode(value: unknown): boolean {
	if (!isRecord(value)) return false;
	if (value.role === 'destination' || value.role === 'dest') return true;
	return value.destination === true;
}

function uniqueNodes(nodes: ProximityNode[]): ProximityNode[] {
	const out: ProximityNode[] = [];
	for (const node of nodes) {
		if (out.some((item) => Math.abs(item.lat - node.lat) < 1e-4 && Math.abs(item.lon - node.lon) < 1e-4)) {
			continue;
		}
		out.push(node);
	}
	return out;
}

function fromNodes(nodes: unknown[]): ProximityFile | null {
	const parsed = nodes.map(parseNode);
	if (parsed.some((node) => node === null)) return null;
	const valid = parsed as ProximityNode[];
	const destIndex = nodes.findIndex(isDestinationNode);
	if (destIndex >= 0) {
		const destination = valid[destIndex] ?? null;
		const locations = uniqueNodes(valid.filter((_, i) => i !== destIndex));
		return { destination, locations };
	}
	if (valid.length === 0) return { destination: null, locations: [] };
	const [destination, ...rest] = valid;
	return { destination: destination ?? null, locations: uniqueNodes(rest) };
}

export function serializeProximity(data: ProximityFile): string {
	return `${JSON.stringify(
		{
			destination: data.destination
				? { name: data.destination.name, lat: data.destination.lat, lon: data.destination.lon }
				: null,
			locations: data.locations.map((node) => ({
				name: node.name,
				lat: node.lat,
				lon: node.lon,
			})),
		},
		null,
		2,
	)}\n`;
}

export function parseProximityJson(text: string): ParseResult {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return { ok: false, error: 'That file is not valid JSON.' };
	}

	if (Array.isArray(raw)) {
		const data = fromNodes(raw);
		if (!data) return { ok: false, error: 'Each node needs a lat and lon.' };
		return { ok: true, data };
	}

	if (!isRecord(raw)) {
		return { ok: false, error: 'Expected a JSON object or a list of nodes.' };
	}

	if (Array.isArray(raw.nodes)) {
		const data = fromNodes(raw.nodes);
		if (!data) return { ok: false, error: 'Each node needs a lat and lon.' };
		return { ok: true, data };
	}

	const destination =
		raw.destination == null ? null : parseNode(raw.destination);
	if (raw.destination != null && destination === null) {
		return { ok: false, error: 'Destination needs a lat and lon.' };
	}

	if (raw.locations != null && !Array.isArray(raw.locations)) {
		return { ok: false, error: 'locations must be a list of nodes.' };
	}

	const locationsRaw = Array.isArray(raw.locations) ? raw.locations : [];
	const locations: ProximityNode[] = [];
	for (const item of locationsRaw) {
		const node = parseNode(item);
		if (!node) return { ok: false, error: 'Each location needs a lat and lon.' };
		locations.push(node);
	}

	return {
		ok: true,
		data: {
			destination,
			locations: uniqueNodes(
				destination ? locations.filter((node) => Math.abs(node.lat - destination.lat) >= 1e-4 || Math.abs(node.lon - destination.lon) >= 1e-4) : locations,
			),
		},
	};
}

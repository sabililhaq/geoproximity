export type DistanceMode = 'straight' | 'driving' | 'walking';

export type Place = {
	id: string;
	name: string;
	lat: number;
	lon: number;
};

export type ProximityState = {
	destination: Place | null;
	locations: Place[];
	distanceMode: DistanceMode;
};

export type ProximityUnit = 'km' | 'mi';

export type Place = {
	id: string;
	name: string;
	lat: number;
	lon: number;
};

export type ProximityState = {
	destination: Place | null;
	locations: Place[];
	unit: ProximityUnit;
};

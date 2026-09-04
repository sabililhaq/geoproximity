import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	distanceKm,
	formatDistance,
	samePlace,
	withDistance,
	withNetworkDistance,
} from '../src/geo';

const paris = { lat: 48.8566, lon: 2.3522 };
const london = { lat: 51.5074, lon: -0.1278 };
const nyc = { lat: 40.7128, lon: -74.006 };

describe('distanceKm', () => {
	it('is zero for the same point', () => {
		expect(distanceKm(paris, paris)).toBe(0);
	});

	it('measures Paris to London around 344 km', () => {
		expect(distanceKm(paris, london)).toBeGreaterThan(330);
		expect(distanceKm(paris, london)).toBeLessThan(360);
	});

	it('measures New York to London around 5,570 km', () => {
		const km = distanceKm(nyc, london);
		expect(km).toBeGreaterThan(5400);
		expect(km).toBeLessThan(5700);
	});
});

describe('formatDistance', () => {
	it('uses two decimals under 1', () => {
		expect(formatDistance(0.4)).toBe('0.40 km');
	});

	it('uses one decimal under 100', () => {
		expect(formatDistance(12.34)).toBe('12.3 km');
	});

	it('rounds larger distances', () => {
		expect(formatDistance(1200)).toBe('1,200 km');
	});
});

describe('samePlace / withDistance', () => {
	it('treats nearby coordinates as the same place', () => {
		expect(samePlace(paris, { lat: 48.85665, lon: 2.35222 })).toBe(true);
		expect(samePlace(paris, london)).toBe(false);
	});

	it('ranks locations by distance to the destination', () => {
		const ranked = withDistance(
			[
				{ id: 'nyc', ...nyc },
				{ id: 'london', ...london },
			],
			paris,
		);
		expect(ranked.map((item) => item.id)).toEqual(['london', 'nyc']);
		expect(ranked[0]!.km).toBeLessThan(ranked[1]!.km);
	});
});

describe('withNetworkDistance', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('flags a missing route and falls back to straight-line distance', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ code: 'NoRoute' }), { status: 200 })),
		);
		const ranked = await withNetworkDistance([{ id: 'london', ...london }], paris);
		expect(ranked[0]!.error).toBe('no_route');
		expect(ranked[0]!.geometry).toBeUndefined();
		expect(ranked[0]!.km).toBeCloseTo(distanceKm(london, paris), 6);
	});

	it('flags network failures per item and keeps successful routes intact', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				if (url.includes(`${london.lon},${london.lat}`)) throw new TypeError('Failed to fetch');
				return new Response(
					JSON.stringify({
						code: 'Ok',
						routes: [
							{
								distance: 6_000_000,
								geometry: {
									type: 'LineString',
									coordinates: [
										[nyc.lon, nyc.lat],
										[paris.lon, paris.lat],
									],
								},
							},
						],
					}),
					{ status: 200 },
				);
			}),
		);
		const ranked = await withNetworkDistance(
			[
				{ id: 'nyc', ...nyc },
				{ id: 'london', ...london },
			],
			paris,
		);
		const byId = Object.fromEntries(ranked.map((item) => [item.id, item]));
		expect(byId.london!.error).toBe('network');
		expect(byId.london!.km).toBeCloseTo(distanceKm(london, paris), 6);
		expect(byId.nyc!.error).toBeUndefined();
		expect(byId.nyc!.km).toBe(6000);
		expect(byId.nyc!.geometry).toHaveLength(2);
	});
});

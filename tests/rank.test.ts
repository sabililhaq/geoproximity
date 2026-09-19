import { describe, expect, it } from 'vitest';
import { rankCandidates, type PeerLeg } from '../src/rank';

const braga = { id: 'braga', name: 'Braga', lat: -6.9206, lon: 107.61 };
const north = { id: 'north', name: 'North', lat: -6.88, lon: 107.61 };
const west = { id: 'west', name: 'West', lat: -6.9206, lon: 107.55 };
const cafeNearNorth = { id: 'cafe-n', name: 'Cafe N', lat: -6.882, lon: 107.611 };
const cafeMiddle = { id: 'cafe-m', name: 'Cafe M', lat: -6.9, lon: 107.58 };
const cafeFar = { id: 'cafe-f', name: 'Cafe F', lat: -7.1, lon: 107.7 };

describe('rankCandidates', () => {
  it('matches one-origin ranking by distance to that origin', () => {
    const ranked = rankCandidates([cafeFar, cafeNearNorth, cafeMiddle], [braga]);
    expect(ranked.map((place) => place.id)).toEqual(['cafe-m', 'cafe-n', 'cafe-f']);
    expect(ranked[0]!.peers).toHaveLength(1);
    expect(ranked[0]!.farthestOriginId).toBe('braga');
    expect(ranked[0]!.totalKm).toBe(ranked[0]!.km);
  });

  it('with several people, prefers the place that shortens the unlucky trip', () => {
    const ranked = rankCandidates([cafeNearNorth, cafeMiddle, cafeFar], [north, west]);
    // Cafe N is next to North and far from West; Cafe M sits between them.
    expect(ranked[0]!.id).toBe('cafe-m');
    expect(ranked[0]!.farthestOriginId).toBeTruthy();
    expect(ranked[0]!.peers).toHaveLength(2);
    expect(ranked[0]!.km).toBeGreaterThan(0);
    expect(ranked[0]!.totalKm).toBeGreaterThan(ranked[0]!.km);
    expect(ranked.map((place) => place.id)[ranked.length - 1]).toBe('cafe-f');
  });

  it('breaks a farthest-person tie using total travel', () => {
    const a = { id: 'a', lat: 0, lon: 0 };
    const a2 = { id: 'a2', lat: 0, lon: 0 };
    const b = { id: 'b', lat: 0, lon: 10 };
    const atA = { id: 'at-a', lat: 0, lon: 0 };
    const atB = { id: 'at-b', lat: 0, lon: 10 };
    const ranked = rankCandidates([atB, atA], [a, a2, b]);
    // Both dump someone 10° away; meeting at A saves the two people already there.
    expect(ranked[0]!.id).toBe('at-a');
    expect(ranked[0]!.km).toBeCloseTo(ranked[1]!.km, 5);
    expect(ranked[0]!.totalKm).toBeLessThan(ranked[1]!.totalKm);
  });

  it('ranks by the slowest peer when byTime is set', () => {
    const ranked = rankCandidates(
      [cafeNearNorth, cafeMiddle],
      [north, west],
      new Map([
        ['north|cafe-n', { originId: 'north', km: 1, durationSec: 60 }],
        ['west|cafe-n', { originId: 'west', km: 20, durationSec: 3600 }],
        ['north|cafe-m', { originId: 'north', km: 8, durationSec: 900 }],
        ['west|cafe-m', { originId: 'west', km: 8, durationSec: 900 }],
      ]),
      true,
    );
    expect(ranked[0]!.id).toBe('cafe-m');
    expect(ranked[0]!.durationSec).toBe(900);
    expect(ranked[1]!.durationSec).toBe(3600);
  });

  it('leaves candidates unranked when nobody has been added', () => {
    const ranked = rankCandidates([cafeMiddle], []);
    expect(ranked[0]!.km).toBeNaN();
    expect(ranked[0]!.peers).toEqual([]);
  });
});

for (const reverse of [false, true]) {
  it(`keeps incomplete trips behind complete routes (reverse people: ${reverse})`, () => {
    const origins = reverse ? [west, north] : [north, west];
    const legs = new Map<string, PeerLeg>([
      ['north|cafe-n', { originId: 'north', km: 1, error: 'network' }],
      ['west|cafe-n', { originId: 'west', km: 2, durationSec: 20 }],
      ['north|cafe-m', { originId: 'north', km: 8, durationSec: 900 }],
      ['west|cafe-m', { originId: 'west', km: 8, durationSec: 900 }],
    ]);
    for (const byTime of [true, false]) {
      const ranked = rankCandidates([cafeNearNorth, cafeMiddle], origins, legs, byTime);
      expect(ranked[0].id).toBe('cafe-m');
      if (byTime) {
        expect(ranked[1].durationSec).toBeUndefined();
        expect(ranked[1].totalDurationSec).toBeUndefined();
        expect(ranked[1].farthestOriginId).toBe('west');
        expect(ranked[1].km).toBe(2);
      }
    }
    // A missing time without an explicit network error is still incomplete.
    legs.set('north|cafe-n', { originId: 'north', km: 1 });
    const ranked = rankCandidates([cafeNearNorth, cafeMiddle], origins, legs, true);
    expect(ranked[0].id).toBe('cafe-m');
    expect(ranked[1].durationSec).toBeUndefined();
  });
}

it('ranks unavailable routes by the maximum fallback distance regardless of person order', () => {
  const legs = new Map<string, PeerLeg>([
    ['north|cafe-n', { originId: 'north', km: 1, error: 'network' }],
    ['west|cafe-n', { originId: 'west', km: 9, error: 'network' }],
    ['north|cafe-m', { originId: 'north', km: 5, error: 'network' }],
    ['west|cafe-m', { originId: 'west', km: 4, error: 'network' }],
  ]);
  for (const origins of [
    [north, west],
    [west, north],
  ]) {
    const ranked = rankCandidates([cafeNearNorth, cafeMiddle], origins, legs, true);
    expect(ranked.map((place) => place.id)).toEqual(['cafe-m', 'cafe-n']);
    expect(ranked[0].km).toBe(5);
    expect(ranked[0].totalKm).toBe(9);
    expect(ranked[0].durationSec).toBeUndefined();
  }
});

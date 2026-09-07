import { describe, expect, it } from 'vitest';
import { parseCoordinates, parseMapsUrl, parsePlaceInput } from '../src/parse-place';

describe('parseCoordinates', () => {
  it('reads lat, lon pairs', () => {
    expect(parseCoordinates('48.8566, 2.3522')).toEqual({ lat: 48.8566, lon: 2.3522 });
    expect(parseCoordinates('-6.92 107.61')).toEqual({ lat: -6.92, lon: 107.61 });
  });

  it('rejects out-of-range and partial values', () => {
    expect(parseCoordinates('91, 0')).toBeNull();
    expect(parseCoordinates('Bandung')).toBeNull();
    expect(parseCoordinates('48.8566')).toBeNull();
  });
});

describe('parseMapsUrl', () => {
  it('reads @lat,lon from a Google Maps URL', () => {
    expect(parseMapsUrl('https://www.google.com/maps/@-6.9205,107.6099,17z')).toEqual({
      lat: -6.9205,
      lon: 107.6099,
    });
    expect(
      parseMapsUrl(
        'https://www.google.com/maps/place/Jalan+Braga/@-6.9205,107.6099,17z/data=!3m1!4b1',
      ),
    ).toEqual({ lat: -6.9205, lon: 107.6099 });
  });

  it('reads q=lat,lon query parameters', () => {
    expect(parseMapsUrl('https://maps.google.com/?q=48.8566,2.3522')).toEqual({
      lat: 48.8566,
      lon: 2.3522,
    });
  });
});

describe('parsePlaceInput', () => {
  it('prefers a bare coordinate pair', () => {
    expect(parsePlaceInput(' 40.7, -74.0 ')).toEqual({ lat: 40.7, lon: -74.0 });
  });
});

import { describe, expect, it } from "vitest";
import { encodeShareHash, readShareHash } from "../src/share";

const state = {
  destination: {
    id: "destination-id",
    name: "Paris",
    lat: 48.8566,
    lon: 2.3522,
  },
  locations: [
    { id: "location-id", name: "London", lat: 51.5074, lon: -0.1278 },
  ],
  distanceMode: "straight" as const,
};

describe("share hash", () => {
  it("round-trips a comparison without ids", () => {
    const result = readShareHash(`#${encodeShareHash(state)}`);

    expect(result).toEqual({
      destination: { name: "Paris", lat: 48.8566, lon: 2.3522 },
      locations: [{ name: "London", lat: 51.5074, lon: -0.1278 }],
    });
  });

  it("rejects malformed or invalid hashes", () => {
    expect(readShareHash("")).toBeNull();
    expect(readShareHash("#nonsense")).toBeNull();
    expect(readShareHash("#proximity=not-json")).toBeNull();
    expect(
      readShareHash(
        `#proximity=${encodeURIComponent(JSON.stringify({ destination: { name: "Bad", lat: 91, lon: 0 } }))}`,
      ),
    ).toBeNull();
  });

  it("ignores a legacy unit field in shared links", () => {
    const hash = `#proximity=${encodeURIComponent(
      JSON.stringify({ destination: null, locations: [], unit: "mi" }),
    )}`;

    expect(readShareHash(hash)).toEqual({ destination: null, locations: [] });
  });
});

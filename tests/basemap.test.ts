import { describe, expect, it } from "vitest";
import { cartoTileUrl, resolveCartoApiKey } from "../src/basemap";

describe("cartoTileUrl", () => {
  it("uses the light raster style by default", () => {
    expect(cartoTileUrl(undefined)).toBe(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    );
  });

  it("uses the dark raster style", () => {
    expect(cartoTileUrl("dark")).toBe(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    );
  });

  it("appends a trimmed key query parameter", () => {
    expect(cartoTileUrl("light", "  abc123  ")).toBe(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=abc123",
    );
  });

  it("encodes reserved characters in the key", () => {
    expect(cartoTileUrl("light", "a&b=c")).toContain("key=a%26b%3Dc");
  });

  it("omits the query when the key is empty", () => {
    expect(cartoTileUrl("light", "   ")).not.toContain("?");
  });
});

describe("resolveCartoApiKey", () => {
  it("prefers an explicit option over the environment", () => {
    expect(resolveCartoApiKey(" from-option ")).toBe("from-option");
  });
});

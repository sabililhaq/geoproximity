import { describe, expect, it } from "vitest";
import { proximityMarkup } from "../src/template";

describe("proximity markup", () => {
  it("has its own destination and location controls", () => {
    for (const hook of [
      "data-dest-input",
      "data-loc-input",
      "data-use-location",
      "data-dest-tools",
      "data-fit",
      "data-clear",
      "data-sample",
      "data-loc-empty",
      'data-route-mode="straight"',
      'data-route-mode="driving"',
      'data-route-mode="walking"',
      "data-route-animation",
      "data-route-animation-reverse",
      'role="switch"',
      'aria-checked="true"',
      'aria-describedby="px-anim-help"',
      'aria-label="Route animation"',
      "data-px-map",
    ]) {
      expect(proximityMarkup).toContain(hook);
    }
    expect(proximityMarkup).not.toContain("data-unit");
  });

  it("does not reuse cartis control ids", () => {
    expect(proximityMarkup).not.toContain('id="search-input"');
    expect(proximityMarkup).not.toContain('id="export-btn"');
    expect(proximityMarkup).not.toContain("data-cartis");
  });

  it("enables network distance buttons", () => {
    expect(proximityMarkup).toContain('data-route-mode="driving"');
    expect(proximityMarkup).toContain('data-route-mode="walking"');
    expect(proximityMarkup).not.toMatch(/data-route-mode="street"/);
  });

  it("keeps route animation inside advanced settings", () => {
    expect(proximityMarkup).toContain('class="px-advanced"');
    expect(proximityMarkup).toContain("<summary>Advanced settings</summary>");
    expect(proximityMarkup).toContain("data-route-animation");
    expect(proximityMarkup).toContain("data-route-animation-reverse");
    expect(proximityMarkup).toContain('role="switch"');
    expect(proximityMarkup).toContain("px-anim-help");
    expect(proximityMarkup.indexOf("px-advanced")).toBeLessThan(
      proximityMarkup.indexOf("data-route-animation"),
    );
  });

  it("adds accessible labels to shared controls", () => {
    expect(proximityMarkup).toContain('aria-label="Share this comparison"');
    expect(proximityMarkup).toContain('aria-label="Load sample data"');
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const css = readFileSync(
  fileURLToPath(new URL("../src/styles.css", import.meta.url)),
  "utf-8",
);

describe("proximity control panel surfaces", () => {
  it("uses the page wash for the sidebar and raised fill for fields", () => {
    expect(css).toMatch(/\.px-sidebar \{[\s\S]*?background: var\(--px-wash\);/);
    expect(css).toMatch(
      /\.px-search input \{[\s\S]*?background: var\(--px-fill\);/,
    );
    expect(css).toMatch(
      /\.px-btn-row button,[\s\S]*?\.px-dest-remove \{[\s\S]*?background: var\(--px-fill\);/,
    );
    expect(css).toMatch(/\.px-row \{[\s\S]*?background: var\(--px-fill\);/);
    expect(css).toMatch(/\.px-seg \{[\s\S]*?background: var\(--px-fill\);/);
    expect(css).toMatch(
      /\.px-map-empty button \{[\s\S]*?background: var\(--px-wash\);/,
    );
  });

  it("uses larger touch targets and stretches the control row across the container", () => {
    expect(css).toMatch(
      /\.px-io-row \{[\s\S]*?width:\s*100%;[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(4,\s*minmax\(2\.75rem,\s*1fr\)\);/,
    );
    expect(css).toMatch(
      /\.px-io-row button \{[\s\S]*?flex:\s*1\s+1\s+0%;[\s\S]*?min-width:\s*2\.75rem;[\s\S]*?min-height:\s*2\.75rem;/,
    );
    expect(css).toMatch(
      /\.px-io-row svg[\s\S]*?width:\s*1\.25rem;[\s\S]*?height:\s*1\.25rem;/,
    );
  });

  it("styles route highlight and selected location row", () => {
    expect(css).toMatch(/\.px-row\.is-selected \{/);
    expect(css).toMatch(/\.px-edge-highlight \{/);
    expect(css).toMatch(/\.px-edge-halo \{/);
    expect(css).toMatch(/\.px-marker-num\.is-selected \{/);
  });
});

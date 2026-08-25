import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('../src/styles.css', import.meta.url)), 'utf-8');

describe('proximity control panel surfaces', () => {
	it('uses the page wash for the sidebar and raised fill for fields', () => {
		expect(css).toMatch(/\.px-sidebar \{[\s\S]*?background: var\(--px-wash\);/);
		expect(css).toMatch(/\.px-search input \{[\s\S]*?background: var\(--px-fill\);/);
		expect(css).toMatch(
			/\.px-btn-row button,[\s\S]*?\.px-dest-remove \{[\s\S]*?background: var\(--px-fill\);/,
		);
		expect(css).toMatch(/\.px-row \{[\s\S]*?background: var\(--px-fill\);/);
		expect(css).toMatch(/\.px-seg \{[\s\S]*?background: var\(--px-fill\);/);
		expect(css).toMatch(/\.px-map-empty button \{[\s\S]*?background: var\(--px-wash\);/);
	});
});

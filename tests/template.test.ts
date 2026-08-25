import { describe, expect, it } from 'vitest';
import { proximityMarkup } from '../src/template';

describe('proximity markup', () => {
	it('has its own destination and location controls', () => {
		for (const hook of [
			'data-dest-input',
			'data-loc-input',
			'data-use-location',
			'data-dest-tools',
			'data-fit',
			'data-clear',
			'data-import',
			'data-export',
			'data-sample',
			'data-loc-empty',
			'data-unit="km"',
			'data-unit="mi"',
			'data-route-mode="straight"',
			'data-route-mode="street"',
			'data-px-map',
		]) {
			expect(proximityMarkup).toContain(hook);
		}
	});

	it('does not reuse cartis control ids', () => {
		expect(proximityMarkup).not.toContain('id="search-input"');
		expect(proximityMarkup).not.toContain('id="export-btn"');
		expect(proximityMarkup).not.toContain('data-cartis');
	});

	it('keeps street distance disabled with hover info', () => {
		expect(proximityMarkup).toMatch(/data-route-mode="street"[^>]*disabled/);
		expect(proximityMarkup).toContain('Street distance follows roads');
	});
});

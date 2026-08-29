export const proximityMarkup = `
<div data-proximity>
	<div class="px-layout">
		<aside class="px-sidebar">
			<div class="px-sidebar-head">
				<h1>Proximity</h1>
				<p>How far are travel locations from a destination?</p>
				<p data-io-status class="px-io-status" role="status" aria-live="polite" hidden></p>
			</div>

			<div class="px-sidebar-body">
				<section class="px-section">
					<h2>Destination</h2>
					<form data-dest-form class="px-search">
						<label class="px-sr" for="px-dest-input">Search destination</label>
						<input id="px-dest-input" data-dest-input type="search" placeholder="Search a destination" autocomplete="off" enterkeyhint="search" />
						<div data-dest-results class="px-results" hidden></div>
					</form>
					<div class="px-btn-row" data-dest-tools>
						<button type="button" data-use-location>Use my location</button>
					</div>
					<div data-dest-current class="px-dest-card" hidden></div>
				</section>

				<section class="px-section">
					<h2>transport hub locations</h2>
					<form data-loc-form class="px-search">
						<label class="px-sr" for="px-loc-input">Add a travel location</label>
						<input id="px-loc-input" data-loc-input type="search" placeholder="Add a city or place" autocomplete="off" enterkeyhint="search" />
						<div data-loc-results class="px-results" hidden></div>
					</form>
					<p data-loc-empty class="px-list-empty">Search a place, or click the map.</p>
					<ul data-loc-list class="px-list" hidden></ul>
				</section>
			</div>

			<div class="px-actions">
				<div class="px-route-row">
					<div class="px-seg" role="group" aria-label="Distance method">
						<button type="button" data-route-mode="straight" aria-pressed="true">Straight line</button>
						<span class="px-tip" tabindex="0">
							<button type="button" data-route-mode="street" aria-pressed="false" aria-disabled="true" disabled>Street</button>
							<span class="px-tip-bubble" role="tooltip">Street distance follows roads. Not available yet — distances are straight-line (great-circle) for now.</span>
						</span>
					</div>
					<div class="px-seg" role="group" aria-label="Distance unit">
						<button type="button" data-unit="km">km</button>
						<button type="button" data-unit="mi">mi</button>
					</div>
				</div>
				<div class="px-io-row">
					<button type="button" data-sample title="Sample">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.64 3.68-1.31-1.31c-.98-.98-2.58-.98-3.56 0L3.68 15.46c-.39.39-.68.88-.84 1.41L2 22l5.13-.84c.53-.16 1.02-.45 1.41-.84l13.09-13.09c.98-.98.98-2.58 0-3.56Z"></path></svg>
					</button>
					<button type="button" data-share hidden title="Share">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
					</button>
					<button type="button" data-fit disabled title="Fit all">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14v6h6"/><path d="M20 10V4h-6"/><path d="M14 20h6v-6"/><path d="M10 4H4v6"/></svg>
					</button>
					<button type="button" data-clear class="px-danger" disabled title="Clear">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
					</button>
				</div>
			</div>
		</aside>

		<div data-px-resizer class="px-resizer" aria-hidden="true">
			<div class="px-resizer-handle"></div>
		</div>

		<div class="px-map-wrap">
			<div data-px-map class="px-map" role="application" aria-label="Proximity map"></div>
			<p data-px-hint class="px-hint" hidden>Click the map to set a destination</p>
			<div data-px-empty class="px-map-empty">
				<p>Set a destination, then add travel locations to compare distance.</p>
				<button type="button" data-sample title="Sample">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: text-bottom;"><path d="m21.64 3.68-1.31-1.31c-.98-.98-2.58-.98-3.56 0L3.68 15.46c-.39.39-.68.88-.84 1.41L2 22l5.13-.84c.53-.16 1.02-.45 1.41-.84l13.09-13.09c.98-.98.98-2.58 0-3.56Z"></path></svg>
					Sample
				</button>
			</div>
		</div>
	</div>
</div>
`;

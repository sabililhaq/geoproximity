export const proximityMarkup = `
<div data-proximity>
	<aside class="px-sidebar">
		<div class="px-sidebar-head">
			<h1>Proximity</h1>
			<p>How far are travel locations from a destination?</p>
			<div class="px-io-row">
				<button type="button" data-sample>Sample</button>
				<button type="button" data-import>Import</button>
				<button type="button" data-export>Export</button>
				<input data-import-file type="file" accept="application/json,.json" hidden />
			</div>
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
				<button type="button" data-fit disabled>Fit all</button>
				<button type="button" data-clear class="px-danger" disabled>Clear</button>
			</div>
		</div>
	</aside>

	<div class="px-map-wrap">
		<div data-px-map class="px-map" role="application" aria-label="Proximity map"></div>
		<p data-px-hint class="px-hint" hidden>Click the map to set a destination</p>
		<div data-px-empty class="px-map-empty">
			<p>Set a destination, then add travel locations to compare distance.</p>
			<button type="button" data-sample>Sample</button>
		</div>
	</div>
</div>
`;

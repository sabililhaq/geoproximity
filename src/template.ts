export const proximityMarkup = `
<div data-proximity>
	<div class="px-layout">
		<aside class="px-sidebar">
			<div class="px-sidebar-body">
				<p data-io-status class="px-io-status" role="status" aria-live="polite" hidden></p>
				<div class="px-route-row">
					<div class="px-seg" role="group" aria-label="Distance method">
						<button type="button" data-route-mode="straight" aria-pressed="true">Straight line</button>
						<button type="button" data-route-mode="driving" aria-pressed="false">Driving</button>
						<button type="button" data-route-mode="walking" aria-pressed="false">Walking</button>
					</div>
					<div class="px-seg" role="group" aria-label="Rank by" data-rank-by hidden>
						<button type="button" data-rank-metric="time" aria-pressed="true">Time</button>
						<button type="button" data-rank-metric="distance" aria-pressed="false">Distance</button>
					</div>
				</div>
				<details class="px-advanced">
					<summary>Advanced settings</summary>
					<div class="px-advanced-body" role="group" aria-label="Route animation">
						<button type="button" class="px-toggle" data-route-animation role="switch" aria-checked="true" aria-describedby="px-anim-help">
							<span>Animate routes</span>
							<span class="px-switch" aria-hidden="true"></span>
						</button>
						<p id="px-anim-help" class="px-sr" data-route-animation-help>Flows dashes along driving and walking routes from locations toward the destination.</p>
						<button type="button" class="px-toggle" data-route-animation-reverse role="switch" aria-checked="false" aria-describedby="px-anim-reverse-help">
							<span>Reverse direction</span>
							<span class="px-switch" aria-hidden="true"></span>
						</button>
						<p id="px-anim-reverse-help" class="px-sr" data-route-animation-reverse-help>When on, dashes flow from the destination toward locations. Requires Animate routes.</p>
					</div>
				</details>
				<section class="px-section">
					<h2>Destination</h2>
					<form data-dest-form class="px-search">
						<label class="px-sr" for="px-dest-input">Search, paste coordinates, or a Maps link</label>
						<input id="px-dest-input" data-dest-input type="search" placeholder="Search, coordinates, or Maps link" autocomplete="off" enterkeyhint="search" />
						<div data-dest-results class="px-results" hidden></div>
					</form>
					<div class="px-btn-row" data-dest-tools>
						<button type="button" data-use-location>Use my location</button>
					</div>
					<div data-dest-current class="px-dest-card" hidden></div>
				</section>

				<section class="px-section">
					<h2>Locations</h2>
					<form data-loc-form class="px-search">
						<label class="px-sr" for="px-loc-input">Add a travel location</label>
						<input id="px-loc-input" data-loc-input type="search" placeholder="Search, coordinates, or Maps link" autocomplete="off" enterkeyhint="search" />
						<div data-loc-results class="px-results" hidden></div>
					</form>
					<p data-loc-empty class="px-list-empty">Search a place, paste coordinates, or click the map to add a comparison location.</p>
					<ul data-loc-list class="px-list" role="listbox" aria-label="Ranked locations" hidden></ul>
				</section>
			</div>

			<div class="px-actions">
				<div class="px-io-row">
					<button type="button" data-sample title="Sample" aria-label="Load sample data">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"></path><path d="M8 8h8v8H8z"></path></svg>
					</button>
					<button type="button" data-share hidden title="Share" aria-label="Share this comparison">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
					</button>
					<button type="button" data-fit disabled title="Fit all" aria-label="Fit all items on the map">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14v6h6"/><path d="M20 10V4h-6"/><path d="M14 20h6v-6"/><path d="M10 4H4v6"/></svg>
					</button>
					<button type="button" data-clear class="px-danger" disabled title="Clear" aria-label="Clear all locations">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
					</button>
				</div>
			</div>
		</aside>

		<div data-px-resizer class="px-resizer" aria-hidden="true">
			<div class="px-resizer-handle"></div>
		</div>

		<div class="px-map-wrap">
			<div data-px-map class="px-map" role="application" aria-label="Geoproximity map"></div>
			<p data-px-hint class="px-hint" hidden>Click the map to set a destination</p>
			<div data-px-empty class="px-map-empty">
				<div class="px-empty-guide" aria-label="How to use Geoproximity">
					<strong>Start here</strong>
					<ol>
						<li>Set a destination</li>
						<li>Add locations to compare</li>
						<li>Pick a route mode</li>
					</ol>
				</div>
				<p>Search for a place, enter coordinates, or click the map to begin.</p>
					<button type="button" data-sample title="Sample" aria-label="Load sample data">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: text-bottom;"><path d="M4 4h16v16H4z"></path><path d="M8 8h8v8H8z"></path></svg>
						Sample
					</button>
			</div>
		</div>
	</div>
</div>
`;

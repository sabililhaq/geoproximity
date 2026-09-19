import { mergeLabels, type UiLabels } from './labels';

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

export function renderProximityMarkup(labels?: Partial<UiLabels>): string {
  const t = mergeLabels(labels);
  return `
<div data-proximity>
	<button type="button" class="px-view-toggle" data-view-toggle aria-pressed="false"><span data-expand-label>${esc(t.expandMap)}</span><span data-places-label hidden>${esc(t.showPlaces)}</span></button>
	<div class="px-layout">
		<aside class="px-sidebar">
			<div class="px-sidebar-body">
				<p data-io-status class="px-io-status" role="status" aria-live="polite" hidden></p>
				<section class="px-section px-people" data-people>
					<button type="button" class="px-people-toggle" data-people-toggle data-person="${esc(t.person)}" data-people="${esc(t.people)}" data-edit="${esc(t.editPeople)}" data-done="${esc(t.donePeople)}" aria-expanded="true" aria-controls="px-people-editor" hidden><span data-people-summary></span><span data-people-action>${esc(t.donePeople)}</span></button>
					<div id="px-people-editor" class="px-section px-people-editor">
					<h2>${esc(t.destination)}<span data-origin-count class="px-loc-count" aria-hidden="true"></span></h2>
					<form data-dest-form class="px-search">
						<label class="px-sr" for="px-dest-input">${esc(t.destPlaceholder)}</label>
						<input id="px-dest-input" data-dest-input type="search" placeholder="${esc(t.destPlaceholder)}" autocomplete="off" enterkeyhint="search" />
						<div data-dest-results class="px-results" hidden></div>
					</form>
					<div class="px-btn-row" data-dest-tools>
						<button type="button" data-use-location>${esc(t.useMyLocation)}</button>
					</div>
					<p data-origin-empty class="px-list-empty">${esc(t.originEmpty)}</p>
					<div data-dest-current class="px-origin-list" hidden></div>
					</div>
				</section>

				<section class="px-section">
					<h2>${esc(t.locations)}<span data-loc-count class="px-loc-count" aria-hidden="true"></span></h2>
					<form data-loc-form class="px-search">
						<label class="px-sr" for="px-loc-input">${esc(t.locPlaceholder)}</label>
						<input id="px-loc-input" data-loc-input type="search" placeholder="${esc(t.locPlaceholder)}" autocomplete="off" enterkeyhint="search" />
						<div data-loc-results class="px-results" hidden></div>
					</form>
				<div class="px-route-row">
					<div class="px-seg" role="group" aria-label="${esc(t.distanceMethod)}">
						<button type="button" data-route-mode="straight" aria-pressed="true">${esc(t.straightLine)}</button>
						<button type="button" data-route-mode="driving" aria-pressed="false">${esc(t.driving)}</button>
						<button type="button" data-route-mode="walking" aria-pressed="false">${esc(t.walking)}</button>
					</div>
					</div>
						<p data-loc-empty class="px-list-empty">${esc(t.locEmpty)}</p>
                        <p data-route-status class="px-route-status" role="status" hidden></p>
					<ul data-loc-list class="px-list" role="listbox" aria-label="${esc(t.rankedLocations)}" hidden></ul>
				</section>
				<details class="px-advanced">
					<summary>${esc(t.advanced)}</summary>
					<div class="px-advanced-body" role="group" aria-label="Display settings">
						<button type="button" class="px-toggle" data-route-animation role="switch" aria-checked="true" aria-describedby="px-anim-help">
							<span>${esc(t.animateRoutes)}</span>
							<span class="px-switch" aria-hidden="true"></span>
						</button>
						<p id="px-anim-help" class="px-sr" data-route-animation-help>Flows dashes along driving and walking routes from locations toward the destination.</p>
						<button type="button" class="px-toggle" data-route-animation-reverse role="switch" aria-checked="false" aria-describedby="px-anim-reverse-help">
							<span>${esc(t.reverseDirection)}</span>
							<span class="px-switch" aria-hidden="true"></span>
						</button>
						<p id="px-anim-reverse-help" class="px-sr" data-route-animation-reverse-help>When on, dashes flow from the destination toward locations. Requires Animate routes.</p>
						<button type="button" class="px-toggle" data-mapless-toggle role="switch" aria-checked="false" aria-describedby="px-mapless-help">
							<span>${esc(t.mapless)}</span>
							<span class="px-switch" aria-hidden="true"></span>
						</button>
						<p id="px-mapless-help" class="px-sr" data-mapless-help>${esc(t.maplessHelp)}</p>
						<button type="button" class="px-toggle" data-scale-toggle role="switch" aria-checked="true" aria-describedby="px-scale-help">
							<span>${esc(t.showScale)}</span>
							<span class="px-switch" aria-hidden="true"></span>
						</button>
						<p id="px-scale-help" class="px-sr" data-scale-help>${esc(t.showScaleHelp)}</p>
					</div>
				</details>
			</div>

			<div class="px-actions">
				<div class="px-io-row">
					<button type="button" data-sample title="${esc(t.sample)}" aria-label="${esc(t.sample)}">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"></path><path d="M8 8h8v8H8z"></path></svg>
					</button>
					<button type="button" data-share hidden title="${esc(t.share)}" aria-label="${esc(t.share)}">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
					</button>
					<button type="button" data-fit disabled title="${esc(t.fit)}" aria-label="${esc(t.fit)}">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14v6h6"/><path d="M20 10V4h-6"/><path d="M14 20h6v-6"/><path d="M10 4H4v6"/></svg>
					</button>
					<button type="button" data-clear class="px-danger" disabled title="${esc(t.clear)}" aria-label="${esc(t.clear)}">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
					</button>
				</div>
			</div>
		</aside>

		<div data-px-resizer class="px-resizer" aria-hidden="true">
			<div class="px-resizer-handle"></div>
		</div>

		<div class="px-map-wrap">
			<div data-px-map class="px-map" role="application" aria-label="${esc(t.mapLabel)}"></div>
			<p data-px-hint class="px-hint" hidden>Click the map to add a starting point</p>
			<button type="button" data-route-retry class="px-map-retry" hidden>Retry routes</button>
			<div data-px-empty class="px-map-empty">
				<div class="px-empty-guide" aria-label="${esc(t.howTo)}">
					<strong>${esc(t.startHere)}</strong>
					<ol>
						<li>${esc(t.step1)}</li>
						<li>${esc(t.step2)}</li>
						<li>${esc(t.step3)}</li>
					</ol>
				</div>
				<p>${esc(t.emptyHelp)}</p>
					<button type="button" data-sample title="${esc(t.sample)}" aria-label="${esc(t.sample)}">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: text-bottom;"><path d="M4 4h16v16H4z"></path><path d="M8 8h8v8H8z"></path></svg>
						${esc(t.sampleButton)}
					</button>
			</div>
		</div>
	</div>
</div>
`;
}

export const proximityMarkup = renderProximityMarkup();

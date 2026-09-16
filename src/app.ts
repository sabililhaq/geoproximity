import L from 'leaflet';
import {
  formatDistance,
  formatDuration,
  geodesicLatLngs,
  clearRouteCache,
  getNetworkDistance,
  samePlace,
  withNetworkMatrix,
} from './geo';
import { reverseGeocode } from './geocoder';
import { parseProximityJson, type ProximityFile } from './io';
import { handleLocationListKeyboard } from './list-keyboard';
import { accentColor, destIcon, locIcon, popupContent, personLabel } from './markers';
import { bindSearch } from './search';
import { encodeShareHash, readShareHash, readStoredState, writeStoredState } from './share';
import sampleProximity from './sample-proximity.json';
import { cartoTileUrl, resolveCartoApiKey } from './basemap';
import { rankCandidates, type PeerLeg, type RankedCandidate } from './rank';
import type { Place, ProximityState, DistanceMode } from './types';

type RankedPlace = RankedCandidate<Place> & {
  geometry?: Array<[number, number]>;
};

let instanceCount = 0;

/**
 * Suffix every `id` inside `root` (and the `for` / `aria-describedby`
 * attributes that point at them) so two mounted instances never share ids.
 */
function scopeIds(root: HTMLElement): void {
  const suffix = `-${++instanceCount}`;
  const renamed = new Map<string, string>();
  for (const el of root.querySelectorAll<HTMLElement>('[id]')) {
    const next = `${el.id}${suffix}`;
    renamed.set(el.id, next);
    el.id = next;
  }
  for (const el of root.querySelectorAll<HTMLElement>('[for]')) {
    const target = renamed.get(el.getAttribute('for') ?? '');
    if (target) el.setAttribute('for', target);
  }
  for (const el of root.querySelectorAll<HTMLElement>('[aria-controls]')) {
    const target = renamed.get(el.getAttribute('aria-controls') ?? '');
    if (target) el.setAttribute('aria-controls', target);
  }
  for (const el of root.querySelectorAll<HTMLElement>('[aria-describedby]')) {
    const ids = (el.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => renamed.get(id) ?? id);
    el.setAttribute('aria-describedby', ids.join(' '));
  }
}

/** Leaflet renders string popup content as HTML; wrap user text in a node. */
const maps = new WeakMap<HTMLElement, L.Map>();

export function invalidateProximity(root: HTMLElement): void {
  const map = maps.get(root);
  if (!map) return;
  map.invalidateSize();
  window.setTimeout(() => map.invalidateSize(), 80);
}

function qs<T extends HTMLElement>(root: ParentNode, sel: string): T {
  const el = root.querySelector(sel);
  if (!(el instanceof HTMLElement)) throw new Error(`Missing ${sel}`);
  return el as T;
}

const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

export type StartProximityOptions = {
  sample?: boolean | ProximityFile;
  share?: boolean;
  /** CARTO raster basemap key. Falls back to VITE_CARTO_API_KEY. */
  cartoApiKey?: string;
};

export type ProximityHandle = {
  (): void;
  destroy: () => void;
  getState: () => ProximityState;
  setState: (
    next: Partial<ProximityState> | (Partial<ProximityFile> & { distanceMode?: DistanceMode }),
  ) => void;
  onChange: (listener: (state: ProximityState) => void) => () => void;
};

export function startProximity(
  root: HTMLElement,
  options: StartProximityOptions = {},
): ProximityHandle {
  const host = qs(root, '[data-proximity]');
  const mapEl = qs(root, '[data-px-map]');
  const destForm = qs<HTMLFormElement>(root, '[data-dest-form]');
  const destInput = qs<HTMLInputElement>(root, '[data-dest-input]');
  const destResults = qs(root, '[data-dest-results]');
  const destTools = qs(root, '[data-dest-tools]');
  const destCurrent = qs(root, '[data-dest-current]');
  const originEmpty = qs(root, '[data-origin-empty]');
  const originCount = qs(root, '[data-origin-count]');
  const locForm = qs<HTMLFormElement>(root, '[data-loc-form]');
  const locInput = qs<HTMLInputElement>(root, '[data-loc-input]');
  const locResults = qs(root, '[data-loc-results]');
  const locList = qs<HTMLUListElement>(root, '[data-loc-list]');
  const locEmpty = qs(root, '[data-loc-empty]');
  const locCount = qs(root, '[data-loc-count]');
  const useLocationBtn = qs<HTMLButtonElement>(root, '[data-use-location]');
  const fitBtn = qs<HTMLButtonElement>(root, '[data-fit]');
  const clearBtn = qs<HTMLButtonElement>(root, '[data-clear]');
  const resizer = root.querySelector('[data-px-resizer]') as HTMLElement | null;
  const layout = root.querySelector('.px-layout') as HTMLElement | null;
  const shareBtn = qs<HTMLButtonElement>(root, '[data-share]');
  const sampleButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-sample]'));
  const ioStatus = qs(root, '[data-io-status]');
  const hint = qs(root, '[data-px-hint]');
  const routeRetry = qs<HTMLButtonElement>(root, '[data-route-retry]');
  const empty = qs(root, '[data-px-empty]');
  const routeModeButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-route-mode]'),
  );
  const routeAnimationToggle = qs<HTMLButtonElement>(root, '[data-route-animation]');
  const routeAnimationHelp = qs(root, '[data-route-animation-help]');
  const routeAnimationReverseToggle = qs<HTMLButtonElement>(root, '[data-route-animation-reverse]');
  const routeAnimationReverseHelp = qs(root, '[data-route-animation-reverse-help]');
  const maplessToggle = qs<HTMLButtonElement>(root, '[data-mapless-toggle]');
  const scaleToggle = qs<HTMLButtonElement>(root, '[data-scale-toggle]');
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let statusTimer = 0;
  let isLoadingDistances = false;
  let selectedLocationId: string | null = null;
  let keyboardFocusedRowId: string | null = null;
  let currentRanked: RankedPlace[] = [];
  let distanceAbort: AbortController | null = null;
  let selectionAbort: AbortController | null = null;
  let lastRankAnnouncement = '';
  const LABEL_ZOOM = 13;
  let labelsPermanent = false;
  let overlayMarkers = new Map<string, L.Marker>();
  /** Driving/walking default to time; straight-line always ranks by distance. */
  const state: ProximityState = {
    destination: null,
    origins: [],
    locations: [],
    distanceMode: 'straight',
  };

  function syncDestination() {
    state.destination = state.origins[0] ?? null;
  }
  scopeIds(root);
  shareBtn.hidden = !options.share;

  const session = new AbortController();
  const peopleSection = qs(root, '.px-people');
  const peopleToggle = qs<HTMLButtonElement>(root, '[data-people-toggle]');
  let peopleCollapsed = false;
  function syncPeople() {
    if (state.origins.length === 0) peopleCollapsed = false;
    peopleToggle.hidden = state.origins.length === 0;
    peopleSection.classList.toggle('is-collapsed', peopleCollapsed);
    peopleToggle.setAttribute('aria-expanded', String(!peopleCollapsed));
    qs(root, '[data-people-summary]').textContent =
      `${state.origins.length} ${state.origins.length === 1 ? peopleToggle.dataset.person : peopleToggle.dataset.people}`;
    qs(root, '[data-people-action]').textContent =
      (peopleCollapsed ? peopleToggle.dataset.edit : peopleToggle.dataset.done) ?? '';
  }
  function collapsePeople() {
    if (host.clientWidth >= 768 || state.origins.length === 0) return;
    peopleCollapsed = true;
    syncPeople();
  }
  peopleToggle.addEventListener(
    'click',
    () => {
      peopleCollapsed = !peopleCollapsed;
      syncPeople();
    },
    { signal: session.signal },
  );
  locInput.addEventListener('focus', collapsePeople, { signal: session.signal });
  const viewToggle = qs<HTMLButtonElement>(root, '[data-view-toggle]');
  viewToggle.addEventListener(
    'click',
    () => {
      const expanded = host.classList.toggle('px-map-expanded');
      host.classList.remove('px-mapless');
      setSwitchOn(maplessToggle, false);
      viewToggle.setAttribute('aria-pressed', String(expanded));
      qs(root, '[data-expand-label]').hidden = expanded;
      qs(root, '[data-places-label]').hidden = !expanded;
      map.invalidateSize();
    },
    { signal: session.signal },
  );
  const map = L.map(mapEl, { worldCopyJump: true }).setView([20, 0], 2);
  L.control.scale({ maxWidth: 120 }).addTo(map);
  const cartoApiKey = resolveCartoApiKey(options.cartoApiKey);
  let tileErrorShown = false;
  let walkingAttributionShown = false;
  const walkingAttribution =
    'Routing © <a href="https://map.project-osrm.org/about.html">FOSSGIS</a> · <a href="https://www.openstreetmap.org/fixthemap">Fix the map</a>';
  const addTiles = () => {
    const layer = L.tileLayer(cartoTileUrl(document.documentElement.dataset.theme, cartoApiKey), {
      maxZoom: 19,
      attribution: CARTO_ATTRIBUTION,
    }).addTo(map);
    layer.on('tileerror', () => {
      if (tileErrorShown) return;
      tileErrorShown = true;
      showStatus('Map tiles failed to load · check your connection or CARTO key');
    });
    layer.on('load', () => {
      tileErrorShown = false;
    });
    return layer;
  };
  let tiles = addTiles();
  const overlay = L.layerGroup().addTo(map);
  maps.set(root, map);

  const themeObs = new MutationObserver(() => {
    tiles.remove();
    tiles = addTiles();
    overlay.addTo(map);
  });
  themeObs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  const resize = new ResizeObserver(() => {
    map.invalidateSize();
    const selected = currentRanked.find((place) => place.id === selectedLocationId);
    if (selected && mapEl.clientWidth > 0 && mapEl.clientHeight > 0) {
      focusRoute(selected, state.destination, overlayMarkers);
    }
  });
  if (resizer && layout) {
    let isDragging = false;
    let isVertical = true;
    let startPos = 0;
    let startSize = 0;

    resizer.addEventListener('pointerdown', (e) => {
      isDragging = true;
      resizer.setPointerCapture(e.pointerId);
      isVertical = getComputedStyle(resizer).cursor === 'row-resize';
      startPos = isVertical ? e.clientY : e.clientX;
      startSize = isVertical
        ? layout.querySelector('.px-sidebar')?.getBoundingClientRect().height || 0
        : layout.querySelector('.px-sidebar')?.getBoundingClientRect().width || 0;
      e.preventDefault();
    });

    resizer.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const delta = isVertical ? startPos - e.clientY : e.clientX - startPos;
      if (isVertical) {
        const minMapSize = Math.min(220, layout.clientHeight * 0.35);
        const maxSize = Math.max(0, layout.clientHeight - minMapSize - 10);
        const newSize = Math.min(maxSize, Math.max(Math.min(200, maxSize), startSize + delta));
        layout.style.setProperty('--px-sidebar-h', `${newSize}px`);
      } else {
        const newSize = Math.max(200, startSize + delta);
        layout.style.setProperty('--px-sidebar-w', `${newSize}px`);
      }
      map.invalidateSize();
    });

    resizer.addEventListener('pointerup', (e) => {
      isDragging = false;
      resizer.releasePointerCapture(e.pointerId);
    });
    resizer.addEventListener('pointercancel', (e) => {
      isDragging = false;
      resizer.releasePointerCapture(e.pointerId);
    });
  }

  resize.observe(mapEl);

  const visualViewport = window.visualViewport;
  let inputVisibilityFrame = 0;
  const keepFocusedInputVisible = () => {
    cancelAnimationFrame(inputVisibilityFrame);
    inputVisibilityFrame = requestAnimationFrame(() => {
      if (session.signal.aborted) return;
      const input = document.activeElement;
      if (!(input instanceof HTMLInputElement) || !host.contains(input)) return;
      const scroller = input.closest<HTMLElement>('.px-sidebar-body');
      if (!scroller) return;
      const field = input.getBoundingClientRect();
      const panel = scroller.getBoundingClientRect();
      const viewportTop = visualViewport?.offsetTop ?? 0;
      const viewportBottom = viewportTop + (visualViewport?.height ?? window.innerHeight);
      const top = Math.max(panel.top, viewportTop) + 12;
      const bottom = Math.min(panel.bottom, viewportBottom) - 12;
      // Scroll only the controls, avoiding a second browser-level viewport pan.
      if (field.bottom > bottom) scroller.scrollTop += field.bottom - bottom;
      else if (field.top < top) scroller.scrollTop -= top - field.top;
    });
  };
  const syncKeyboardViewport = () => {
    if (!visualViewport) {
      keepFocusedInputVisible();
      return;
    }
    // Pinch zoom also shrinks the visual viewport; compare at the layout scale.
    const keyboardOpen = visualViewport.height * visualViewport.scale < window.innerHeight - 120;
    host.classList.toggle('is-keyboard-open', keyboardOpen);
    if (keyboardOpen) {
      host.style.height = `${Math.max(1, visualViewport.height)}px`;
      host.style.transform = `translate3d(0, ${Math.max(0, visualViewport.offsetTop)}px, 0)`;
    } else {
      host.style.removeProperty('height');
      host.style.removeProperty('transform');
    }
    map.invalidateSize();
    keepFocusedInputVisible();
  };
  if (visualViewport) {
    visualViewport.addEventListener('resize', syncKeyboardViewport, {
      signal: session.signal,
    });
    visualViewport.addEventListener('scroll', syncKeyboardViewport, {
      signal: session.signal,
    });
  }
  host.addEventListener(
    'focusin',
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      syncKeyboardViewport();
    },
    { signal: session.signal },
  );
  window.addEventListener('resize', syncKeyboardViewport, { signal: session.signal });

  /** Move DOM focus to the rendered row for `placeId`, if it exists. */
  function focusRow(placeId: string | null) {
    if (!placeId) return;
    const row = locList.querySelector<HTMLElement>(`[data-place-id="${placeId}"]`);
    row?.focus();
  }

  function focusRowByIndex(index: number, ranked: RankedPlace[]) {
    if (ranked.length === 0) return;
    const clamped = Math.min(Math.max(index, 0), ranked.length - 1);
    const place = ranked[clamped];
    keyboardFocusedRowId = place.id;
    // Explicitly select (not toggle) so arrowing onto the highlighted row
    // does not clear it.
    selectedLocationId = place.id;
    doRender(ranked);
    focusRow(place.id);
  }

  function onLocationListKeydown(event: KeyboardEvent, ranked: RankedPlace[]) {
    handleLocationListKeyboard(event, ranked, {
      focusedId: keyboardFocusedRowId,
      onMove: (index, list) => focusRowByIndex(index, list),
      onActivate: (id, list) => {
        selectLocation(id, list, { fit: true });
        focusRow(id);
      },
      onEscape: () => {
        selectedLocationId = null;
        render();
        focusRow(keyboardFocusedRowId);
      },
      onRemove: (removedId, neighbour) => {
        const removed = state.locations.find((item) => item.id === removedId);
        const snap = snapshotState();
        if (selectedLocationId === removedId) selectedLocationId = null;
        state.locations = state.locations.filter((item) => item.id !== removedId);
        syncDestination();
        keyboardFocusedRowId = neighbour?.id ?? null;
        render();
        focusRow(keyboardFocusedRowId);
        if (removed) showUndo(`Removed ${removed.name}.`, snap);
      },
    });
  }

  function byTime(): boolean {
    return state.distanceMode !== 'straight';
  }

  function isGroup(): boolean {
    return state.origins.length > 1;
  }

  function calculatingGroup(): boolean {
    return isGroup() && state.locations.length > 1;
  }

  function calculatingHint(): string {
    return 'Multi-peer mode, calculating distances';
  }

  function placeMetricLabel(place: RankedPlace): string {
    if (!Number.isFinite(place.km)) return '';
    const dist = `${place.error ? '≈ ' : ''}${formatDistance(place.km)}`;
    const time =
      byTime() && typeof place.durationSec === 'number' && Number.isFinite(place.durationSec)
        ? formatDuration(place.durationSec)
        : '';
    if (isGroup()) {
      if (byTime() && !time) return 'Travel time incomplete';
      const farthest = time ? `${time} · ${dist}` : dist;
      const total =
        byTime() &&
        typeof place.totalDurationSec === 'number' &&
        Number.isFinite(place.totalDurationSec)
          ? `${formatDuration(place.totalDurationSec)} total`
          : Number.isFinite(place.totalKm)
            ? `${formatDistance(place.totalKm)} total`
            : '';
      return total ? `${farthest} farthest · ${total}` : `${farthest} farthest`;
    }
    if (time) return `${time} · ${dist}`;
    return dist;
  }

  function rankedLocations(): RankedPlace[] {
    return rankCandidates(state.locations, state.origins);
  }

  async function rankedLocationsAsync(signal: AbortSignal): Promise<RankedPlace[]> {
    if (state.distanceMode === 'straight' || state.origins.length === 0) {
      return rankedLocations();
    }
    const mode = state.distanceMode === 'driving' ? 'driving' : 'walking';
    const matrix = await withNetworkMatrix(state.origins, state.locations, mode, signal);
    const legs = new Map<string, PeerLeg>();
    for (const [key, result] of matrix) {
      const originId = key.slice(0, key.indexOf('|'));
      legs.set(key, {
        originId,
        km: result.km,
        durationSec: result.durationSec,
        error: result.error,
      });
    }
    return rankCandidates(state.locations, state.origins, legs, true);
  }

  function fit(force = true) {
    const points: L.LatLngExpression[] = [];
    for (const origin of state.origins) points.push([origin.lat, origin.lon]);
    for (const place of state.locations) points.push([place.lat, place.lon]);
    if (points.length === 0) {
      if (force) map.setView([20, 0], 2);
      return;
    }
    if (points.length === 1) {
      map.setView(points[0], 8);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 12 });
  }

  function modeLabel(mode: DistanceMode): string {
    if (mode === 'driving') return 'driving';
    if (mode === 'walking') return 'walking';
    return 'straight-line';
  }

  function switchOn(button: HTMLButtonElement): boolean {
    return button.getAttribute('aria-checked') === 'true';
  }

  function setSwitchOn(button: HTMLButtonElement, on: boolean) {
    button.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  function setSwitchUnavailable(
    button: HTMLButtonElement,
    unavailable: boolean,
    help: HTMLElement,
    description: string,
  ) {
    button.setAttribute('aria-disabled', unavailable ? 'true' : 'false');
    button.title = description;
    help.textContent = description;
  }

  function applyRouteAnimation() {
    const routed = state.distanceMode !== 'straight';
    const reduced = motionQuery.matches;
    const animateOn = switchOn(routeAnimationToggle);
    const reverseOn = switchOn(routeAnimationReverseToggle);
    const animating = routed && animateOn && !reduced;
    const reducedHelp = 'Unavailable because your system prefers reduced motion.';
    if (reduced) {
      setSwitchUnavailable(routeAnimationToggle, true, routeAnimationHelp, reducedHelp);
      setSwitchUnavailable(
        routeAnimationReverseToggle,
        true,
        routeAnimationReverseHelp,
        reducedHelp,
      );
    } else if (!routed) {
      setSwitchUnavailable(
        routeAnimationToggle,
        true,
        routeAnimationHelp,
        'Available for driving and walking routes.',
      );
      setSwitchUnavailable(
        routeAnimationReverseToggle,
        true,
        routeAnimationReverseHelp,
        'Turn on Animate routes to reverse direction. Available for driving and walking routes.',
      );
    } else {
      setSwitchUnavailable(
        routeAnimationToggle,
        false,
        routeAnimationHelp,
        'Flows dashes along routes from people toward the selected place.',
      );
      setSwitchUnavailable(
        routeAnimationReverseToggle,
        !animateOn,
        routeAnimationReverseHelp,
        animateOn
          ? 'Flows dashes from the selected place toward people.'
          : 'Turn on Animate routes to reverse direction.',
      );
    }
    host.classList.toggle('px-animate-routes', animating);
    host.classList.toggle('px-animate-routes-reverse', animating && reverseOn);
  }

  function render() {
    selectionAbort?.abort();
    if (state.distanceMode !== 'straight') {
      void renderAsync();
      return;
    }
    doRender(rankedLocations());
  }

  async function fillRouteGeometries(ranked: RankedPlace[], signal: AbortSignal) {
    if (state.origins.length === 0 || state.distanceMode === 'straight') return;
    const mode = state.distanceMode === 'driving' ? 'driving' : 'walking';

    let scheduled = 0;
    const redraw = () => {
      const id = ++scheduled;
      requestAnimationFrame(() => {
        if (id !== scheduled || signal.aborted) return;
        doRender(currentRanked, { fitSelection: Boolean(selectedLocationId) });
      });
    };

    if (!isGroup()) {
      const dest = state.origins[0];
      if (!dest) return;
      const pending = ranked.filter((place) => !place.geometry && !place.error);
      if (pending.length === 0) return;
      await Promise.all(
        pending.map(async (place) => {
          const route = await getNetworkDistance(place, dest, mode, signal);
          if (signal.aborted || !route.geometry) return;
          place.geometry = route.geometry;
          const peer = place.peers[0];
          if (peer) peer.geometry = route.geometry;
          if (route.durationSec != null) place.durationSec = route.durationSec;
          redraw();
        }),
      );
      return;
    }

    const selected = ranked.find((place) => place.id === selectedLocationId);
    if (!selected) return;
    await Promise.all(
      selected.peers.map(async (peer) => {
        if (peer.geometry || peer.error) return;
        const origin = state.origins.find((item) => item.id === peer.originId);
        if (!origin) return;
        const route = await getNetworkDistance(origin, selected, mode, signal);
        if (signal.aborted || !route.geometry) return;
        peer.geometry = route.geometry;
        redraw();
      }),
    );
  }

  async function renderAsync() {
    distanceAbort?.abort();
    const controller = new AbortController();
    distanceAbort = controller;
    const { signal } = controller;

    isLoadingDistances = true;
    for (const btn of routeModeButtons) {
      btn.disabled = true;
    }
    host.classList.add('is-routing');
    hint.hidden = false;
    hint.textContent = calculatingGroup()
      ? calculatingHint()
      : `Fetching ${modeLabel(state.distanceMode)} routes…`;

    try {
      const ranked = await rankedLocationsAsync(signal);
      if (signal.aborted) return;
      const fallback = ranked.filter((place) => place.error).length;
      if (fallback > 0) {
        const label = modeLabel(state.distanceMode);
        showStatus(
          fallback === ranked.length
            ? `${label.charAt(0).toUpperCase()}${label.slice(1)} routing unavailable · showing straight-line distances.`
            : `No ${label} route for ${fallback} of ${ranked.length} locations · straight-line shown for those.`,
        );
      }
      routeRetry.hidden = fallback === 0;
      isLoadingDistances = false;
      host.classList.remove('is-routing');
      for (const btn of routeModeButtons) {
        btn.disabled = false;
      }
      doRender(ranked);
      await fillRouteGeometries(ranked, signal);
    } catch {
      if (!signal.aborted) {
        const label = modeLabel(state.distanceMode);
        const message = `Could not fetch ${label} routes · showing straight-line distance`;
        hint.textContent = message;
        showStatus(message);
        routeRetry.hidden = false;
      }
    } finally {
      if (distanceAbort === controller) {
        isLoadingDistances = false;
        distanceAbort = null;
        host.classList.remove('is-routing');
        for (const btn of routeModeButtons) {
          btn.disabled = false;
        }
      }
    }
  }

  routeRetry.addEventListener(
    'click',
    () => {
      clearRouteCache();
      routeRetry.hidden = true;
      render();
    },
    { signal: session.signal },
  );

  function focusRoute(place: RankedPlace, dest: Place | null, markers: Map<string, L.Marker>) {
    if (isGroup()) {
      const points: L.LatLngExpression[] = [
        [place.lat, place.lon],
        ...state.origins.map((origin) => [origin.lat, origin.lon] as L.LatLngExpression),
      ];
      for (const peer of place.peers) {
        if (peer.geometry) {
          points.push(...peer.geometry.map(([lon, lat]) => [lat, lon] as L.LatLngExpression));
        }
      }
      // Leave room above the venue for its popup as well as the map controls.
      const height = map.getSize().y;
      map.fitBounds(L.latLngBounds(points), {
        paddingTopLeft: [48, Math.min(160, height * 0.55)],
        paddingBottomRight: [48, Math.min(60, height * 0.2)],
        maxZoom: 14,
        animate: false,
      });
    } else if (dest && place.geometry && place.geometry.length > 1) {
      const latlngs = place.geometry.map(([lon, lat]) => [lat, lon] as L.LatLngExpression);
      map.fitBounds(L.latLngBounds(latlngs), {
        padding: [48, 48],
        maxZoom: 14,
      });
    } else {
      map.setView([place.lat, place.lon], Math.max(map.getZoom(), 13));
    }
    markers.get(place.id)?.openPopup();
  }

  function selectLocation(placeId: string, ranked: RankedPlace[], selectOpts?: { fit?: boolean }) {
    selectionAbort?.abort();
    collapsePeople();
    const nextId = selectedLocationId === placeId ? null : placeId;
    selectedLocationId = nextId;
    doRender(ranked, {
      fitSelection: Boolean(selectOpts?.fit && nextId),
    });
    if (nextId && state.distanceMode !== 'straight') {
      selectionAbort = new AbortController();
      void fillRouteGeometries(ranked, selectionAbort.signal);
    }
  }

  locList.addEventListener(
    'keydown',
    (e) => {
      onLocationListKeydown(e, currentRanked);
    },
    { signal: session.signal },
  );

  function doRender(ranked: RankedPlace[], renderOpts?: { fitSelection?: boolean }) {
    currentRanked = ranked;
    const dest = state.destination;
    const color = accentColor();
    const group = isGroup();

    if (selectedLocationId && !ranked.some((place) => place.id === selectedLocationId)) {
      selectedLocationId = null;
    }

    for (const btn of routeModeButtons) {
      btn.setAttribute(
        'aria-pressed',
        btn.dataset.routeMode === state.distanceMode ? 'true' : 'false',
      );
    }
    applyRouteAnimation();
    const walking = state.distanceMode === 'walking';
    if (walking !== walkingAttributionShown) {
      if (walking) map.attributionControl.addAttribution(walkingAttribution);
      else map.attributionControl.removeAttribution(walkingAttribution);
      walkingAttributionShown = walking;
    }

    labelsPermanent = map.getZoom() >= LABEL_ZOOM;
    overlay.clearLayers();
    const markers = new Map<string, L.Marker>();
    overlayMarkers = markers;
    const selectedLines: L.Polyline[] = [];
    const hasSelection = Boolean(selectedLocationId);

    function focusPlace(place: Place) {
      map.setView([place.lat, place.lon], Math.max(map.getZoom(), 13));
      markers.get(place.id)?.openPopup();
    }

    destForm.hidden = false;
    destTools.hidden = false;
    originCount.textContent = state.origins.length > 0 ? ` (${state.origins.length})` : '';
    syncPeople();
    originEmpty.hidden = state.origins.length > 0;
    destCurrent.hidden = state.origins.length === 0;
    destCurrent.replaceChildren();

    for (const [originIndex, origin] of state.origins.entries()) {
      const originMarker = L.marker([origin.lat, origin.lon], {
        icon: destIcon(group ? personLabel(originIndex) : undefined),
        zIndexOffset: 600,
        title: origin.name,
        draggable: true,
      })
        .bindPopup(popupContent(origin.name))
        .on('dragend', (event) => {
          const point = event.target.getLatLng();
          origin.lat = point.lat;
          origin.lon = point.lng;
          syncDestination();
          clearRouteCache();
          render();
          showStatus(`Moved ${origin.name}.`);
        })
        .addTo(overlay);
      const originEl = originMarker.getElement();
      if (originEl) {
        originEl.setAttribute('role', 'img');
        originEl.setAttribute(
          'aria-label',
          `Starting point${group ? ` ${personLabel(originIndex)}` : ''}, ${origin.name}`,
        );
      }
      if (labelsPermanent) {
        originMarker.bindTooltip(popupContent(origin.name), {
          direction: 'right',
          offset: [14, 0],
          permanent: true,
          className: 'px-place-label',
          opacity: 0.95,
        });
      }
      markers.set(origin.id, originMarker);

      const card = document.createElement('div');
      card.className = 'px-dest-card has-place';
      const copy = document.createElement('div');
      copy.className = 'px-dest-copy';
      const title = document.createElement('strong');
      title.textContent = origin.name;
      title.title = 'Double-click to rename';
      title.addEventListener('dblclick', (event) => beginRename(origin, title, event));
      const meta = document.createElement('span');
      meta.textContent = `${origin.lat.toFixed(4)}, ${origin.lon.toFixed(4)}`;
      copy.append(title, meta);
      if (group) {
        const badge = document.createElement('span');
        badge.className = 'px-person-badge';
        badge.textContent = personLabel(originIndex);
        copy.prepend(badge);
      }
      copy.append(renameButton(origin, title));
      copy.title = 'Show on map';
      copy.addEventListener('click', () => focusPlace(origin));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'px-dest-remove';
      remove.setAttribute('aria-label', `Remove ${origin.name}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        const snap = snapshotState();
        state.origins = state.origins.filter((item) => item.id !== origin.id);
        syncDestination();
        render();
        showUndo(`Removed ${origin.name}.`, snap);
      });
      card.append(copy, remove);
      destCurrent.append(card);
    }

    locList.replaceChildren();
    locCount.textContent = ranked.length > 0 ? ` (${ranked.length})` : '';
    locEmpty.hidden = ranked.length > 0;
    locList.hidden = ranked.length === 0;
    for (const [index, place] of ranked.entries()) {
      const kmLabel = placeMetricLabel(place);
      const isSelected = place.id === selectedLocationId;
      const farthestLabel =
        Number.isFinite(place.km) && !place.error
          ? `${formatDistance(place.km)}`
          : Number.isFinite(place.km)
            ? `≈ ${formatDistance(place.km)}`
            : '—';
      const totalLabel =
        Number.isFinite(place.totalKm) && !place.error
          ? `${formatDistance(place.totalKm)}`
          : Number.isFinite(place.totalKm)
            ? `≈ ${formatDistance(place.totalKm)}`
            : '—';
      const groupMeta =
        group && (Number.isFinite(place.km) || Number.isFinite(place.totalKm))
          ? `Farthest: ${farthestLabel} · Total: ${totalLabel}`
          : '';
      const locMarker = L.marker([place.lat, place.lon], {
        icon: locIcon(index + 1, isSelected),
        zIndexOffset: isSelected ? 550 : 400,
        title: place.name,
        draggable: true,
      })
        .bindPopup(
          popupContent(
            Number.isFinite(place.km)
              ? `${place.name} · ${place.error ? '≈ ' : ''}${formatDistance(place.km)}${group ? ' farthest' : ''}`
              : place.name,
          ),
          {
            maxWidth: 220,
            keepInView: true,
            autoPanPaddingTopLeft: L.point(48, 72),
            autoPanPaddingBottomRight: L.point(12, 60),
          },
        )
        .on('click', () => {
          selectLocation(place.id, ranked, { fit: true });
        })
        .on('dragend', (event) => {
          const point = event.target.getLatLng();
          place.lat = point.lat;
          place.lon = point.lng;
          clearRouteCache();
          render();
          showStatus(`Moved ${place.name}.`);
        })
        .addTo(overlay);
      const locEl = locMarker.getElement();
      if (locEl) {
        locEl.setAttribute('role', 'img');
        locEl.setAttribute(
          'aria-label',
          kmLabel
            ? `${place.name}, rank ${index + 1}, ${kmLabel}`
            : `${place.name}, rank ${index + 1}`,
        );
      }
      if (labelsPermanent) {
        locMarker.bindTooltip(popupContent(place.name), {
          direction: 'right',
          offset: [14, 0],
          permanent: true,
          className: 'px-place-label',
          opacity: 0.95,
        });
      }
      markers.set(place.id, locMarker);
      function drawLeg(
        from: Place,
        to: Place,
        geometry: Array<[number, number]> | undefined,
        selected: boolean,
      ) {
        const latlngs: L.LatLngExpression[] = geometry
          ? geometry.map(([lon, lat]) => [lat, lon])
          : geodesicLatLngs(from, to);
        const dashArray = geometry ? undefined : '6 6';
        const dimmed = hasSelection && !selected;
        const routedClass = geometry ? ' px-edge-routed' : '';
        if (selected) {
          L.polyline(latlngs, {
            color,
            weight: 10,
            opacity: 0.22,
            dashArray,
            className: 'px-edge px-edge-halo',
            interactive: false,
          }).addTo(overlay);
        }
        const line: L.Polyline = L.polyline(latlngs, {
          color,
          weight: selected ? 5 : dimmed ? 2 : 2.5,
          opacity: selected ? 1 : dimmed ? 0.18 : 0.45,
          dashArray,
          className: selected
            ? `px-edge${routedClass} px-edge-highlight`
            : dimmed
              ? `px-edge${routedClass} px-edge-dim`
              : `px-edge${routedClass}`,
          interactive: true,
        });
        line.on('click', (event) => {
          L.DomEvent.stopPropagation(event);
          selectLocation(place.id, ranked, { fit: true });
        });
        line.addTo(overlay);
        if (selected) selectedLines.push(line);
      }

      if (group) {
        if (isSelected) {
          for (const origin of state.origins) {
            const peer = place.peers.find((leg) => leg.originId === origin.id);
            drawLeg(origin, place, peer?.geometry, true);
          }
        }
      } else if (dest) {
        drawLeg(place, dest, place.geometry ?? place.peers[0]?.geometry, isSelected);
      }

      const row = document.createElement('li');
      row.className = isSelected ? 'px-row is-selected' : 'px-row';
      row.classList.toggle('px-row-group', group);
      row.title = isSelected ? 'Click again to clear highlight' : 'Highlight route on map';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      const rank = document.createElement('span');
      rank.className = 'px-rank';
      rank.textContent = String(index + 1);
      const name = document.createElement('span');
      name.className = 'px-row-name';
      name.textContent = place.name;
      name.title = `${place.name} · double-click to rename`;
      name.addEventListener('dblclick', (event) => beginRename(place, name, event));
      const dist = document.createElement('span');
      dist.className = place.error ? 'px-row-dist is-approx' : 'px-row-dist';
      dist.textContent = kmLabel || '—';
      if (place.error) {
        dist.title =
          place.error === 'no_route'
            ? `No ${modeLabel(state.distanceMode)} route found · straight-line estimate`
            : 'Routing service unavailable · straight-line estimate';
      }
      row.setAttribute(
        'aria-label',
        `${place.name}, rank ${index + 1}${kmLabel ? `, ${kmLabel}` : ''}${place.error ? ', approximate route' : ''}`,
      );
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'px-row-remove';
      remove.setAttribute('aria-label', `Remove ${place.name}`);
      remove.textContent = '×';
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        const snap = snapshotState();
        if (selectedLocationId === place.id) selectedLocationId = null;
        state.locations = state.locations.filter((item) => item.id !== place.id);
        render();
        showUndo(`Removed ${place.name}.`, snap);
      });
      row.addEventListener('click', (event) => {
        if (event.detail > 1) return;
        selectLocation(place.id, ranked, { fit: true });
      });
      // Keyboard handling lives on the list (one listener, bubbling), so
      // rows only need to report focus.
      row.addEventListener('focus', () => {
        keyboardFocusedRowId = place.id;
      });
      row.dataset.placeId = place.id;
      row.setAttribute('tabindex', '0');
      const body = document.createElement('div');
      body.className = 'px-row-body';
      body.append(name);
      if (group) {
        const meta = document.createElement('span');
        meta.className = 'px-row-meta';
        meta.textContent = groupMeta;
        body.append(dist, meta);
      }
      if (group && isSelected && place.peers.length > 0) {
        const peers = document.createElement('ul');
        peers.className = 'px-peer-list';
        for (const peer of place.peers) {
          const origin = state.origins.find((item) => item.id === peer.originId);
          const li = document.createElement('li');
          if (peer.originId === place.farthestOriginId) li.className = 'is-farthest';
          const peerDist = Number.isFinite(peer.km)
            ? `${peer.error ? '≈ ' : ''}${formatDistance(peer.km)}`
            : '—';
          const peerTime =
            byTime() && typeof peer.durationSec === 'number' && Number.isFinite(peer.durationSec)
              ? `${formatDuration(peer.durationSec)} · `
              : '';
          const badge = document.createElement('span');
          badge.className = 'px-person-badge';
          badge.textContent = personLabel(
            state.origins.findIndex((item) => item.id === peer.originId),
          );
          li.append(
            badge,
            ` ${origin?.name ?? 'Someone'}: ${peerTime}${peerDist}${byTime() && !peerTime ? ' · time unavailable' : ''}`,
          );
          peers.append(li);
        }
        body.append(peers);
      }
      if (isSelected) body.append(renameButton(place, name));
      if (group) row.append(rank, body, remove);
      else row.append(rank, body, dist, remove);
      locList.append(row);
      if (isSelected) {
        queueMicrotask(() => {
          const rowRect = row.getBoundingClientRect();
          const scroller = row.closest<HTMLElement>('.px-sidebar-body');
          if (!scroller || !row.isConnected) return;
          const panel = scroller.getBoundingClientRect();
          if (rowRect.top < panel.top || rowRect.height > panel.height) {
            scroller.scrollTop += rowRect.top - panel.top;
          } else if (rowRect.bottom > panel.bottom) {
            scroller.scrollTop += rowRect.bottom - panel.bottom;
          }
        });
      }
    }

    for (const line of selectedLines) line.bringToFront();

    if (renderOpts?.fitSelection && selectedLocationId) {
      const selected = ranked.find((place) => place.id === selectedLocationId);
      if (selected) focusRoute(selected, dest, markers);
    }

    const hasNodes = state.origins.length > 0 || state.locations.length > 0;
    if (state.distanceMode === 'straight') routeRetry.hidden = true;
    const selected = selectedLocationId
      ? ranked.find((place) => place.id === selectedLocationId)
      : undefined;
    if (isLoadingDistances) {
      hint.textContent = calculatingGroup()
        ? calculatingHint()
        : `Fetching ${modeLabel(state.distanceMode)} routes…`;
    } else if (selected) {
      hint.textContent = 'Tap the selected place again to clear';
    } else if (state.origins.length > 0) {
      const approx = ranked.filter((place) => place.error).length;
      const label = modeLabel(state.distanceMode);
      hint.textContent =
        state.distanceMode === 'straight'
          ? group
            ? "Select a place to see everyone's trip"
            : 'Click a location or path to highlight'
          : approx === 0
            ? `Showing ${label} routes · click to highlight`
            : approx === ranked.length
              ? `${label.charAt(0).toUpperCase()}${label.slice(1)} routing unavailable · showing straight-line distances`
              : `Showing ${label} routes · ${approx} of ${ranked.length} fell back to straight-line`;
    } else {
      hint.textContent = 'Click the map to add a starting point';
    }
    hint.hidden = !hasNodes;
    host.classList.toggle('has-selection', Boolean(selected));
    empty.hidden = hasNodes;
    fitBtn.disabled = !hasNodes;
    clearBtn.disabled = !hasNodes;
    shareBtn.disabled = !hasNodes;

    if (options.share) {
      window.history.replaceState(null, '', `#${encodeShareHash(state)}`);
    }
    writeStoredState(state);

    const orderKey = `${state.distanceMode}:${ranked.map((place) => place.id).join(',')}`;
    if (
      lastRankAnnouncement &&
      orderKey !== lastRankAnnouncement &&
      state.origins.length > 0 &&
      ranked.length > 0 &&
      !isLoadingDistances &&
      !undoOpen
    ) {
      const top = ranked[0]!;
      const metric = placeMetricLabel(top);
      const by = isGroup()
        ? 'farthest person'
        : state.distanceMode === 'straight'
          ? 'distance'
          : 'time';
      const win = isGroup() ? 'fairest' : 'closest';
      if (!top.error && (!byTime() || top.totalDurationSec !== undefined)) {
        showStatus(
          metric
            ? `Ranked by ${by} · ${top.name} is ${win} at ${metric}`
            : `Ranked by ${by} · ${top.name} is ${win}`,
        );
      }
    }
    lastRankAnnouncement = orderKey;
    notifyChange();
  }

  type StateSnapshot = {
    destination: Place | null;
    origins: Place[];
    locations: Place[];
    selectedLocationId: string | null;
    keyboardFocusedRowId: string | null;
  };

  let undoOpen = false;
  const changeListeners = new Set<(state: ProximityState) => void>();

  function cloneState(): ProximityState {
    const origins = state.origins.map((item) => ({ ...item }));
    return {
      destination: origins[0] ? { ...origins[0] } : null,
      origins,
      locations: state.locations.map((item) => ({ ...item })),
      distanceMode: state.distanceMode,
    };
  }

  function notifyChange() {
    const snap = cloneState();
    for (const listener of changeListeners) listener(snap);
  }

  function snapshotState(): StateSnapshot {
    const origins = state.origins.map((item) => ({ ...item }));
    return {
      destination: origins[0] ? { ...origins[0] } : null,
      origins,
      locations: state.locations.map((item) => ({ ...item })),
      selectedLocationId,
      keyboardFocusedRowId,
    };
  }

  function restoreSnapshot(snap: StateSnapshot) {
    state.origins = snap.origins.map((item) => ({ ...item }));
    syncDestination();
    state.locations = snap.locations;
    selectedLocationId = snap.selectedLocationId;
    keyboardFocusedRowId = snap.keyboardFocusedRowId;
    undoOpen = false;
    render();
    fit(true);
    focusRow(keyboardFocusedRowId);
  }

  function showStatus(message: string) {
    undoOpen = false;
    ioStatus.hidden = false;
    ioStatus.textContent = message;
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => {
      ioStatus.hidden = true;
      ioStatus.textContent = '';
    }, 5000);
  }

  function showUndo(message: string, snap: StateSnapshot) {
    undoOpen = true;
    ioStatus.hidden = false;
    ioStatus.replaceChildren();
    const text = document.createElement('span');
    text.textContent = `${message} `;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'px-undo';
    btn.textContent = 'Undo';
    btn.addEventListener('click', () => {
      window.clearTimeout(statusTimer);
      restoreSnapshot(snap);
      ioStatus.hidden = true;
      ioStatus.replaceChildren();
    });
    ioStatus.append(text, btn);
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => {
      undoOpen = false;
      ioStatus.hidden = true;
      ioStatus.replaceChildren();
    }, 8000);
  }

  function applyFile(data: ProximityFile) {
    selectedLocationId = null;
    const originNodes =
      data.origins && data.origins.length > 0
        ? data.origins
        : data.destination
          ? [data.destination]
          : [];
    state.origins = originNodes.map((node) => ({ id: crypto.randomUUID(), ...node }));
    syncDestination();
    state.locations = data.locations.map((node) => ({
      id: crypto.randomUUID(),
      ...node,
    }));
    render();
    fit(true);
  }

  function addOrigin(place: Place) {
    if (state.origins.some((item) => samePlace(item, place))) return;
    state.locations = state.locations.filter((item) => !samePlace(item, place));
    state.origins.push(place);
    syncDestination();
    render();
    fit();
  }

  function renameButton(place: Place, label: HTMLElement): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'px-rename-button';
    button.textContent = 'Rename';
    button.setAttribute('aria-label', `Rename ${place.name}`);
    button.addEventListener('click', (event) => beginRename(place, label, event));
    return button;
  }

  function beginRename(place: Place, el: HTMLElement, event?: Event) {
    event?.stopPropagation();
    event?.preventDefault();
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'px-row-rename';
    input.value = place.name;
    input.setAttribute('aria-label', `Rename ${place.name}`);
    const commit = () => {
      const next = input.value.trim();
      if (next && next !== place.name) {
        const origin = state.origins.find((item) => item.id === place.id);
        if (origin) origin.name = next;
        syncDestination();
        const loc = state.locations.find((item) => item.id === place.id);
        if (loc) loc.name = next;
      }
      render();
      focusRow(place.id);
    };
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        input.value = place.name;
        input.blur();
      }
    });
    input.addEventListener('blur', commit);
    el.replaceWith(input);
    input.focus();
    input.select();
  }

  function addLocation(place: Place) {
    if (state.origins.some((item) => samePlace(item, place))) return;
    if (state.locations.some((item) => samePlace(item, place))) return;
    state.locations.push(place);
    render();
    fit();
  }

  const searchBias = () => {
    if (state.origins[0]) {
      return { lat: state.origins[0].lat, lon: state.origins[0].lon };
    }
    const center = map.getCenter();
    return { lat: center.lat, lon: center.lng };
  };
  bindSearch(root, destInput, destResults, destForm, addOrigin, session.signal, searchBias);
  bindSearch(
    root,
    locInput,
    locResults,
    locForm,
    addLocation,
    session.signal,
    searchBias,
    true,
    (message) => showStatus(message),
  );

  useLocationBtn.addEventListener(
    'click',
    () => {
      if (!navigator.geolocation) {
        showStatus('Location services not available on this device');
        return;
      }
      useLocationBtn.disabled = true;
      useLocationBtn.textContent = 'Locating…';
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const name = await reverseGeocode(lat, lon, session.signal);
          if (session.signal.aborted) return;
          addOrigin({
            id: crypto.randomUUID(),
            name: name || 'My location',
            lat,
            lon,
          });
          useLocationBtn.disabled = false;
          useLocationBtn.textContent = 'Use my location';
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            showStatus('Enable location permission in browser settings');
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            showStatus('Location not available (check GPS/connection)');
          } else if (error.code === error.TIMEOUT) {
            showStatus('Location request timed out');
          } else {
            showStatus('Could not determine location');
          }
          useLocationBtn.disabled = false;
          useLocationBtn.textContent = 'Use my location';
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    },
    { signal: session.signal },
  );

  fitBtn.addEventListener('click', () => fit(true), { signal: session.signal });

  function loadSample(announce = true) {
    const custom = typeof options.sample === 'object' ? options.sample : null;
    const result = custom
      ? { ok: true as const, data: custom }
      : parseProximityJson(JSON.stringify(sampleProximity));
    if (!result.ok) {
      showStatus(result.error);
      return;
    }
    applyFile(result.data);
    if (!announce) return;
    const originCountLoaded = result.data.origins?.length ?? (result.data.destination ? 1 : 0);
    const count = result.data.locations.length + originCountLoaded;
    showStatus(`Loaded sample · ${count} nodes.`);
  }

  for (const btn of sampleButtons) {
    btn.addEventListener('click', () => loadSample(true), {
      signal: session.signal,
    });
  }

  if (options.share) {
    shareBtn.setAttribute('aria-label', 'Share this comparison');
    shareBtn.addEventListener(
      'click',
      async () => {
        const url = window.location.href;

        try {
          if (navigator.share) {
            try {
              await navigator.share({
                title: 'Geoproximity',
                text: 'Compare destinations by proximity.',
                url,
              });
              showStatus('Share sheet opened.');
              return;
            } catch (error) {
              if (error instanceof DOMException && error.name === 'AbortError') {
                showStatus('Share cancelled.');
                return;
              }
            }
          }

          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(url);
            showStatus('Link copied to clipboard.');
            return;
          }

          const temp = document.createElement('textarea');
          temp.value = url;
          temp.setAttribute('readonly', 'true');
          temp.style.position = 'fixed';
          temp.style.top = '-9999px';
          document.body.append(temp);
          temp.select();
          document.execCommand('copy');
          temp.remove();
          showStatus('Link copied to clipboard.');
        } catch {
          showStatus('Could not copy link.');
        }
      },
      { signal: session.signal },
    );
  }

  clearBtn.addEventListener(
    'click',
    () => {
      const snap = snapshotState();
      selectedLocationId = null;
      keyboardFocusedRowId = null;
      state.origins = [];
      syncDestination();
      state.locations = [];
      render();
      fit(true);
      showUndo('Cleared comparison.', snap);
    },
    { signal: session.signal },
  );

  for (const btn of routeModeButtons) {
    btn.addEventListener(
      'click',
      () => {
        const mode = btn.dataset.routeMode as DistanceMode;
        if (!mode) return;
        if (mode === state.distanceMode) return;
        selectedLocationId = null;
        state.distanceMode = mode;
        render();
      },
      { signal: session.signal },
    );
  }

  function onAnimationSwitchClick(button: HTMLButtonElement) {
    if (button.getAttribute('aria-disabled') === 'true') return;
    setSwitchOn(button, !switchOn(button));
    applyRouteAnimation();
  }

  function applyMaplessView() {
    host.classList.toggle('px-mapless', switchOn(maplessToggle));
    map.invalidateSize();
  }

  function applyScaleVisibility() {
    host.classList.toggle('px-hide-scale', !switchOn(scaleToggle));
  }

  routeAnimationToggle.addEventListener(
    'click',
    () => {
      onAnimationSwitchClick(routeAnimationToggle);
    },
    { signal: session.signal },
  );
  routeAnimationReverseToggle.addEventListener(
    'click',
    () => {
      onAnimationSwitchClick(routeAnimationReverseToggle);
    },
    { signal: session.signal },
  );
  maplessToggle.addEventListener(
    'click',
    () => {
      setSwitchOn(maplessToggle, !switchOn(maplessToggle));
      applyMaplessView();
    },
    { signal: session.signal },
  );
  scaleToggle.addEventListener(
    'click',
    () => {
      setSwitchOn(scaleToggle, !switchOn(scaleToggle));
      applyScaleVisibility();
    },
    { signal: session.signal },
  );
  motionQuery.addEventListener('change', applyRouteAnimation, {
    signal: session.signal,
  });

  map.on('zoomend', () => {
    const next = map.getZoom() >= LABEL_ZOOM;
    if (next === labelsPermanent) return;
    if (state.origins.length > 0 || state.locations.length > 0) {
      doRender(currentRanked.length ? currentRanked : rankedLocations());
      if (selectedLocationId) overlayMarkers.get(selectedLocationId)?.openPopup();
    }
  });

  map.on('click', (event: L.LeafletMouseEvent) => {
    const { lat, lng } = event.latlng;
    void reverseGeocode(lat, lng, session.signal).then((name) => {
      if (session.signal.aborted) return;
      const place: Place = { id: crypto.randomUUID(), name, lat, lon: lng };
      if (state.origins.length === 0) addOrigin(place);
      else addLocation(place);
    });
  });

  // Ctrl/Cmd+K is a "jump to search" key, so it must work before the widget
  // has focus. Listen on the document but ignore keys typed into other
  // widgets on the page.
  document.addEventListener(
    'keydown',
    (e) => {
      if (!((e.ctrlKey || e.metaKey) && e.key === 'k')) return;
      const target = e.target;
      const outside =
        target instanceof Node &&
        target !== document.body &&
        target !== document.documentElement &&
        !root.contains(target);
      if (outside) return;
      e.preventDefault();
      const input = document.activeElement === destInput ? locInput : destInput;
      input.focus();
      input.select();
    },
    { signal: session.signal },
  );

  host.addEventListener(
    'keydown',
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        const snap = snapshotState();
        selectedLocationId = null;
        keyboardFocusedRowId = null;
        state.origins = [];
        syncDestination();
        state.locations = [];
        render();
        fit(true);
        showUndo('Cleared comparison.', snap);
      }
    },
    { signal: session.signal },
  );

  const shareHash = window.location.hash;
  const shared = options.share ? readShareHash(shareHash) : null;
  const invalidShared =
    options.share && /^#(?:px2|px|proximity)=/.test(shareHash) && shared === null;
  const stored = shared ? null : readStoredState();
  if (shared) {
    if (shared.distanceMode) state.distanceMode = shared.distanceMode;
    applyFile(shared);
    const count =
      shared.locations.length + (shared.origins?.length ?? (shared.destination ? 1 : 0));
    showStatus(`Loaded from shared link · ${count} nodes.`);
  } else if (stored) {
    if (stored.distanceMode) state.distanceMode = stored.distanceMode;
    applyFile(stored);
    showStatus('Restored your previous comparison.');
  } else if (options.sample && state.origins.length === 0 && state.locations.length === 0) {
    loadSample(false);
  } else {
    render();
  }
  if (invalidShared) showStatus('That shared comparison link is invalid.');
  window.setTimeout(() => map.invalidateSize(), 0);

  function setState(
    next: Partial<ProximityState> | (Partial<ProximityFile> & { distanceMode?: DistanceMode }),
  ) {
    if ('origins' in next && next.origins) {
      state.origins = next.origins.map((node) => ({
        id: crypto.randomUUID(),
        name: node.name,
        lat: node.lat,
        lon: node.lon,
      }));
      syncDestination();
    } else if ('destination' in next && next.destination !== undefined) {
      state.origins = next.destination
        ? [
            {
              id: crypto.randomUUID(),
              name: next.destination.name,
              lat: next.destination.lat,
              lon: next.destination.lon,
            },
          ]
        : [];
      syncDestination();
    }
    if ('locations' in next && next.locations) {
      state.locations = next.locations.map((node) => ({
        id: crypto.randomUUID(),
        name: node.name,
        lat: node.lat,
        lon: node.lon,
      }));
    }
    if ('distanceMode' in next && next.distanceMode) {
      state.distanceMode = next.distanceMode;
    }
    selectedLocationId = null;
    render();
    fit(true);
  }

  const destroy = () => {
    changeListeners.clear();
    session.abort();
    distanceAbort?.abort();
    selectionAbort?.abort();
    window.clearTimeout(statusTimer);
    themeObs.disconnect();
    resize.disconnect();
    maps.delete(root);
    map.remove();
  };

  return Object.assign(destroy, {
    destroy,
    getState: cloneState,
    setState,
    onChange: (listener: (state: ProximityState) => void) => {
      changeListeners.add(listener);
      return () => {
        changeListeners.delete(listener);
      };
    },
  });
}

import L from 'leaflet';
import {
  formatDistance,
  formatDuration,
  geodesicLatLngs,
  getNetworkDistance,
  samePlace,
  withDistance,
  withNetworkDistance,
  type RouteError,
} from './geo';
import { reverseGeocode } from './geocoder';
import { parseProximityJson, type ProximityFile } from './io';
import { handleLocationListKeyboard } from './list-keyboard';
import { accentColor, destIcon, locIcon, popupContent } from './markers';
import { bindSearch } from './search';
import { encodeShareHash, readShareHash, readStoredState, writeStoredState } from './share';
import sampleProximity from './sample-proximity.json';
import { cartoTileUrl, resolveCartoApiKey } from './basemap';
import type { Place, ProximityState, DistanceMode } from './types';

type RankedPlace = Place & {
  km: number;
  durationSec?: number;
  geometry?: Array<[number, number]>;
  /** Routing failed for this place; `km` is a straight-line fallback. */
  error?: RouteError;
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
  setState: (next: Partial<ProximityState> | ProximityFile) => void;
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
  const locForm = qs<HTMLFormElement>(root, '[data-loc-form]');
  const locInput = qs<HTMLInputElement>(root, '[data-loc-input]');
  const locResults = qs(root, '[data-loc-results]');
  const locList = qs<HTMLUListElement>(root, '[data-loc-list]');
  const locEmpty = qs(root, '[data-loc-empty]');
  const useLocationBtn = qs<HTMLButtonElement>(root, '[data-use-location]');
  const fitBtn = qs<HTMLButtonElement>(root, '[data-fit]');
  const clearBtn = qs<HTMLButtonElement>(root, '[data-clear]');
  const resizer = root.querySelector('[data-px-resizer]') as HTMLElement | null;
  const layout = root.querySelector('.px-layout') as HTMLElement | null;
  const shareBtn = qs<HTMLButtonElement>(root, '[data-share]');
  const sampleButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-sample]'));
  const ioStatus = qs(root, '[data-io-status]');
  const hint = qs(root, '[data-px-hint]');
  const empty = qs(root, '[data-px-empty]');
  const routeModeButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-route-mode]'),
  );
  const rankByGroup = root.querySelector('[data-rank-by]') as HTMLElement | null;
  const rankMetricButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-rank-metric]'),
  );
  const routeAnimationToggle = qs<HTMLButtonElement>(root, '[data-route-animation]');
  const routeAnimationHelp = qs(root, '[data-route-animation-help]');
  const routeAnimationReverseToggle = qs<HTMLButtonElement>(root, '[data-route-animation-reverse]');
  const routeAnimationReverseHelp = qs(root, '[data-route-animation-reverse-help]');
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let statusTimer = 0;
  let isLoadingDistances = false;
  let selectedLocationId: string | null = null;
  let keyboardFocusedRowId: string | null = null;
  let currentRanked: RankedPlace[] = [];
  let distanceAbort: AbortController | null = null;
  let lastRankAnnouncement = '';
  const LABEL_ZOOM = 13;
  let labelsPermanent = false;
  let overlayMarkers = new Map<string, L.Marker>();
  /** Driving/walking default to time; straight-line always ranks by distance. */
  let rankByTime = true;
  const state: ProximityState = {
    destination: null,
    locations: [],
    distanceMode: 'straight',
  };
  scopeIds(root);
  shareBtn.hidden = !options.share;

  const session = new AbortController();
  const map = L.map(mapEl, { worldCopyJump: true }).setView([20, 0], 2);
  L.control.scale({ maxWidth: 120 }).addTo(map);
  const cartoApiKey = resolveCartoApiKey(options.cartoApiKey);
  let tileErrorShown = false;
  const addTiles = () => {
    const layer = L.tileLayer(cartoTileUrl(document.documentElement.dataset.theme, cartoApiKey), {
      maxZoom: 19,
      subdomains: 'abcd',
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

  const resize = new ResizeObserver(() => map.invalidateSize());
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
      const newSize = Math.max(200, startSize + delta);
      if (isVertical) {
        layout.style.setProperty('--px-sidebar-h', `${newSize}px`);
      } else {
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

  resize.observe(host);

  const visualViewport = window.visualViewport;
  const syncKeyboardViewport = () => {
    if (!visualViewport) return;
    const keyboardOpen = visualViewport.height < window.innerHeight - 120;
    host.classList.toggle('is-keyboard-open', keyboardOpen);
    if (keyboardOpen) {
      host.style.height = `${Math.max(1, visualViewport.height)}px`;
    } else {
      host.style.removeProperty('height');
    }
    map.invalidateSize();
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
      window.setTimeout(() => {
        syncKeyboardViewport();
        target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }, 80);
    },
    { signal: session.signal },
  );

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
        keyboardFocusedRowId = neighbour?.id ?? null;
        render();
        focusRow(keyboardFocusedRowId);
        if (removed) showUndo(`Removed ${removed.name}.`, snap);
      },
    });
  }

  function sortRanked(places: RankedPlace[]): RankedPlace[] {
    const byTime = rankByTime && state.distanceMode !== 'straight';
    return [...places].sort((a, b) => {
      if (byTime) {
        const at =
          typeof a.durationSec === 'number' && Number.isFinite(a.durationSec)
            ? a.durationSec
            : Infinity;
        const bt =
          typeof b.durationSec === 'number' && Number.isFinite(b.durationSec)
            ? b.durationSec
            : Infinity;
        if (at !== bt) return at - bt;
      }
      const ak = Number.isFinite(a.km) ? a.km : Infinity;
      const bk = Number.isFinite(b.km) ? b.km : Infinity;
      return ak - bk;
    });
  }

  function placeMetricLabel(place: RankedPlace): string {
    if (!Number.isFinite(place.km)) return '';
    const dist = `${place.error ? '≈ ' : ''}${formatDistance(place.km)}`;
    if (
      state.distanceMode !== 'straight' &&
      typeof place.durationSec === 'number' &&
      Number.isFinite(place.durationSec)
    ) {
      return `${formatDuration(place.durationSec)} · ${dist}`;
    }
    return dist;
  }

  function rankedLocations(): RankedPlace[] {
    if (!state.destination) {
      return state.locations.map((place) => ({ ...place, km: Number.NaN }));
    }
    return sortRanked(withDistance(state.locations, state.destination));
  }

  async function rankedLocationsAsync(signal: AbortSignal): Promise<RankedPlace[]> {
    if (!state.destination) {
      return state.locations.map((place) => ({ ...place, km: Number.NaN }));
    }
    if (state.distanceMode === 'straight') {
      return rankedLocations();
    }
    const mode = state.distanceMode === 'driving' ? 'driving' : 'walking';
    return sortRanked(await withNetworkDistance(state.locations, state.destination, mode, signal));
  }

  function fit(force = true) {
    const points: L.LatLngExpression[] = [];
    if (state.destination) points.push([state.destination.lat, state.destination.lon]);
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
        'Flows dashes along routes from locations toward the destination.',
      );
      setSwitchUnavailable(
        routeAnimationReverseToggle,
        !animateOn,
        routeAnimationReverseHelp,
        animateOn
          ? 'Flows dashes from the destination toward locations.'
          : 'Turn on Animate routes to reverse direction.',
      );
    }
    host.classList.toggle('px-animate-routes', animating);
    host.classList.toggle('px-animate-routes-reverse', animating && reverseOn);
  }

  function render() {
    if (state.distanceMode !== 'straight') {
      void renderAsync();
    } else {
      doRender(rankedLocations());
    }
  }

  async function fillRouteGeometries(ranked: RankedPlace[], signal: AbortSignal) {
    const dest = state.destination;
    if (!dest || state.distanceMode === 'straight') return;
    const mode = state.distanceMode === 'driving' ? 'driving' : 'walking';
    const pending = ranked.filter((place) => !place.geometry && !place.error);
    if (pending.length === 0) return;

    let scheduled = 0;
    const redraw = () => {
      const id = ++scheduled;
      requestAnimationFrame(() => {
        if (id !== scheduled || signal.aborted) return;
        doRender(currentRanked);
      });
    };

    await Promise.all(
      pending.map(async (place) => {
        const route = await getNetworkDistance(place, dest, mode, signal);
        if (signal.aborted || !route.geometry) return;
        place.geometry = route.geometry;
        if (route.durationSec != null) place.durationSec = route.durationSec;
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
    hint.textContent = `Fetching ${modeLabel(state.distanceMode)} routes…`;

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
      isLoadingDistances = false;
      host.classList.remove('is-routing');
      for (const btn of routeModeButtons) {
        btn.disabled = false;
      }
      doRender(ranked);
      await fillRouteGeometries(ranked, signal);
    } catch {
      if (!signal.aborted) {
        hint.textContent = `Could not fetch ${modeLabel(state.distanceMode)} routes · showing straight-line distance`;
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

  function focusRoute(
    place: Place & { geometry?: Array<[number, number]> },
    dest: Place | null,
    markers: Map<string, L.Marker>,
  ) {
    if (dest && place.geometry && place.geometry.length > 1) {
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
    const nextId = selectedLocationId === placeId ? null : placeId;
    selectedLocationId = nextId;
    doRender(ranked, {
      fitSelection: Boolean(selectOpts?.fit && nextId),
    });
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

    if (selectedLocationId && !ranked.some((place) => place.id === selectedLocationId)) {
      selectedLocationId = null;
    }

    for (const btn of routeModeButtons) {
      btn.setAttribute(
        'aria-pressed',
        btn.dataset.routeMode === state.distanceMode ? 'true' : 'false',
      );
    }
    if (rankByGroup) {
      rankByGroup.hidden = state.distanceMode === 'straight';
    }
    for (const btn of rankMetricButtons) {
      const isTime = btn.dataset.rankMetric === 'time';
      btn.setAttribute('aria-pressed', isTime === rankByTime ? 'true' : 'false');
    }
    applyRouteAnimation();

    labelsPermanent = map.getZoom() >= LABEL_ZOOM;
    overlay.clearLayers();
    const markers = new Map<string, L.Marker>();
    overlayMarkers = markers;
    let selectedPolyline: L.Polyline | null = null;
    const hasSelection = Boolean(selectedLocationId);

    function focusPlace(place: Place) {
      map.setView([place.lat, place.lon], Math.max(map.getZoom(), 13));
      markers.get(place.id)?.openPopup();
    }

    destForm.hidden = Boolean(dest);
    destTools.hidden = Boolean(dest);

    if (dest) {
      const destMarker = L.marker([dest.lat, dest.lon], {
        icon: destIcon(),
        zIndexOffset: 600,
        title: dest.name,
      })
        .bindPopup(popupContent(dest.name))
        .addTo(overlay);
      const destEl = destMarker.getElement();
      if (destEl) {
        destEl.setAttribute('role', 'img');
        destEl.setAttribute('aria-label', `Destination, ${dest.name}`);
      }
      if (labelsPermanent) {
        destMarker.bindTooltip(popupContent(dest.name), {
          direction: 'right',
          offset: [14, 0],
          permanent: true,
          className: 'px-place-label',
          opacity: 0.95,
        });
      }
      markers.set(dest.id, destMarker);

      destCurrent.hidden = false;
      destCurrent.classList.add('has-place');
      destCurrent.replaceChildren();
      const copy = document.createElement('div');
      copy.className = 'px-dest-copy';
      const title = document.createElement('strong');
      title.textContent = dest.name;
      title.title = 'Double-click to rename';
      title.addEventListener('dblclick', (event) => beginRename(dest, title, event));
      const meta = document.createElement('span');
      meta.textContent = `${dest.lat.toFixed(4)}, ${dest.lon.toFixed(4)}`;
      copy.append(title, meta);
      copy.title = 'Show on map';
      copy.addEventListener('click', () => focusPlace(dest));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'px-dest-remove';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        const snap = snapshotState();
        const name = dest.name;
        selectedLocationId = null;
        state.destination = null;
        render();
        showUndo(`Removed ${name}.`, snap);
      });
      destCurrent.append(copy, remove);
    } else {
      destCurrent.hidden = true;
      destCurrent.classList.remove('has-place');
      destCurrent.replaceChildren();
    }

    locList.replaceChildren();
    locEmpty.hidden = ranked.length > 0;
    locList.hidden = ranked.length === 0;
    for (const [index, place] of ranked.entries()) {
      const kmLabel = placeMetricLabel(place);
      const isSelected = place.id === selectedLocationId;
      const locMarker = L.marker([place.lat, place.lon], {
        icon: locIcon(index + 1, isSelected),
        zIndexOffset: isSelected ? 550 : 400,
        title: place.name,
      })
        .bindPopup(popupContent(kmLabel ? `${place.name} · ${kmLabel}` : place.name))
        .on('click', () => {
          selectLocation(place.id, ranked, { fit: true });
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
      if (dest) {
        const latlngs: L.LatLngExpression[] = place.geometry
          ? place.geometry.map(([lon, lat]) => [lat, lon])
          : geodesicLatLngs(place, dest);
        const dashArray = place.geometry ? undefined : '6 6';
        const dimmed = hasSelection && !isSelected;
        const routedClass = place.geometry ? ' px-edge-routed' : '';
        if (isSelected) {
          L.polyline(latlngs, {
            color,
            weight: 10,
            opacity: 0.22,
            dashArray,
            className: 'px-edge px-edge-halo',
            interactive: false,
          }).addTo(overlay);
        }
        const line = L.polyline(latlngs, {
          color,
          weight: isSelected ? 5 : dimmed ? 2 : 2.5,
          opacity: isSelected ? 1 : dimmed ? 0.18 : 0.45,
          dashArray,
          className: isSelected
            ? `px-edge${routedClass} px-edge-highlight`
            : dimmed
              ? `px-edge${routedClass} px-edge-dim`
              : `px-edge${routedClass}`,
          interactive: true,
        })
          .on('click', (event) => {
            L.DomEvent.stopPropagation(event);
            selectLocation(place.id, ranked, { fit: true });
          })
          .addTo(overlay);
        if (isSelected) selectedPolyline = line;
      }

      const row = document.createElement('li');
      row.className = isSelected ? 'px-row is-selected' : 'px-row';
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
      row.append(rank, name, dist, remove);
      locList.append(row);
      if (isSelected) {
        queueMicrotask(() => {
          const rowRect = row.getBoundingClientRect();
          const listRect = locList.getBoundingClientRect();
          if (rowRect.top < listRect.top) {
            locList.scrollTop -= listRect.top - rowRect.top;
          } else if (rowRect.bottom > listRect.bottom) {
            locList.scrollTop += rowRect.bottom - listRect.bottom;
          }
        });
      }
    }

    if (selectedPolyline) selectedPolyline.bringToFront();

    if (renderOpts?.fitSelection && selectedLocationId && dest) {
      const selected = ranked.find((place) => place.id === selectedLocationId);
      if (selected) focusRoute(selected, dest, markers);
    }

    const hasNodes = Boolean(dest) || state.locations.length > 0;
    const selected = selectedLocationId
      ? ranked.find((place) => place.id === selectedLocationId)
      : undefined;
    if (isLoadingDistances) {
      hint.textContent = `Fetching ${modeLabel(state.distanceMode)} routes…`;
    } else if (selected) {
      const metric = placeMetricLabel(selected);
      const label = metric ? `${selected.name} · ${metric}` : selected.name;
      hint.textContent = `Highlighted: ${label} · click again to clear`;
    } else if (dest) {
      const approx = ranked.filter((place) => place.error).length;
      const label = modeLabel(state.distanceMode);
      hint.textContent =
        state.distanceMode === 'straight'
          ? 'Click a location or path to highlight'
          : approx === 0
            ? `Showing ${label} routes · click to highlight`
            : approx === ranked.length
              ? `${label.charAt(0).toUpperCase()}${label.slice(1)} routing unavailable · showing straight-line distances`
              : `Showing ${label} routes · ${approx} of ${ranked.length} fell back to straight-line`;
    } else {
      hint.textContent = 'Click the map to set a destination';
    }
    hint.hidden = !hasNodes;
    empty.hidden = hasNodes;
    fitBtn.disabled = !hasNodes;
    clearBtn.disabled = !hasNodes;

    if (options.share) {
      window.history.replaceState(null, '', `#${encodeShareHash(state)}`);
    }
    writeStoredState(state);

    const orderKey = `${state.distanceMode}:${rankByTime ? 'time' : 'km'}:${ranked.map((place) => place.id).join(',')}`;
    if (
      lastRankAnnouncement &&
      orderKey !== lastRankAnnouncement &&
      dest &&
      ranked.length > 0 &&
      !isLoadingDistances &&
      !undoOpen
    ) {
      const top = ranked[0]!;
      const metric = placeMetricLabel(top);
      const by = state.distanceMode === 'straight' || !rankByTime ? 'distance' : 'time';
      showStatus(
        metric
          ? `Ranked by ${by} · ${top.name} is closest at ${metric}`
          : `Ranked by ${by} · ${top.name} is closest`,
      );
    }
    lastRankAnnouncement = orderKey;
    notifyChange();
  }

  type StateSnapshot = {
    destination: Place | null;
    locations: Place[];
    selectedLocationId: string | null;
    keyboardFocusedRowId: string | null;
  };

  let undoOpen = false;
  const changeListeners = new Set<(state: ProximityState) => void>();

  function cloneState(): ProximityState {
    return {
      destination: state.destination ? { ...state.destination } : null,
      locations: state.locations.map((item) => ({ ...item })),
      distanceMode: state.distanceMode,
    };
  }

  function notifyChange() {
    const snap = cloneState();
    for (const listener of changeListeners) listener(snap);
  }

  function snapshotState(): StateSnapshot {
    return {
      destination: state.destination ? { ...state.destination } : null,
      locations: state.locations.map((item) => ({ ...item })),
      selectedLocationId,
      keyboardFocusedRowId,
    };
  }

  function restoreSnapshot(snap: StateSnapshot) {
    state.destination = snap.destination;
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
    state.destination = data.destination ? { id: crypto.randomUUID(), ...data.destination } : null;
    state.locations = data.locations.map((node) => ({
      id: crypto.randomUUID(),
      ...node,
    }));
    render();
    fit(true);
  }

  function setDestination(place: Place) {
    state.destination = place;
    state.locations = state.locations.filter((item) => !samePlace(item, place));
    render();
    fit();
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
        if (state.destination?.id === place.id) state.destination.name = next;
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
    if (state.destination && samePlace(state.destination, place)) return;
    if (state.locations.some((item) => samePlace(item, place))) return;
    state.locations.push(place);
    render();
    fit();
  }

  const searchBias = () => {
    if (state.destination) {
      return { lat: state.destination.lat, lon: state.destination.lon };
    }
    const center = map.getCenter();
    return { lat: center.lat, lon: center.lng };
  };
  bindSearch(root, destInput, destResults, destForm, setDestination, session.signal, searchBias);
  bindSearch(root, locInput, locResults, locForm, addLocation, session.signal, searchBias);

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
          setDestination({
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
    const count = result.data.locations.length + (result.data.destination ? 1 : 0);
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
      state.destination = null;
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

  for (const btn of rankMetricButtons) {
    btn.addEventListener(
      'click',
      () => {
        const next = btn.dataset.rankMetric === 'time';
        if (next === rankByTime) return;
        rankByTime = next;
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
  motionQuery.addEventListener('change', applyRouteAnimation, {
    signal: session.signal,
  });

  map.on('zoomend', () => {
    const next = map.getZoom() >= LABEL_ZOOM;
    if (next === labelsPermanent) return;
    if (state.destination || state.locations.length > 0) {
      doRender(currentRanked.length ? currentRanked : rankedLocations());
      if (selectedLocationId) overlayMarkers.get(selectedLocationId)?.openPopup();
    }
  });

  map.on('click', (event: L.LeafletMouseEvent) => {
    const { lat, lng } = event.latlng;
    void reverseGeocode(lat, lng, session.signal).then((name) => {
      if (session.signal.aborted) return;
      const place: Place = { id: crypto.randomUUID(), name, lat, lon: lng };
      if (!state.destination) setDestination(place);
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
      // The destination form is hidden once a destination is set, so fall
      // through to the locations input in that case.
      const input = destForm.hidden || document.activeElement === destInput ? locInput : destInput;
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
        state.destination = null;
        state.locations = [];
        render();
        fit(true);
        showUndo('Cleared comparison.', snap);
      }
    },
    { signal: session.signal },
  );

  const shared = options.share ? readShareHash(window.location.hash) : null;
  const stored = shared ? null : readStoredState();
  if (shared) {
    if (shared.distanceMode) state.distanceMode = shared.distanceMode;
    applyFile(shared);
    const count = shared.locations.length + (shared.destination ? 1 : 0);
    showStatus(`Loaded from shared link · ${count} nodes.`);
  } else if (stored) {
    if (stored.distanceMode) state.distanceMode = stored.distanceMode;
    applyFile(stored);
  } else if (options.sample && !state.destination && state.locations.length === 0) {
    loadSample(false);
  } else {
    render();
  }
  window.setTimeout(() => map.invalidateSize(), 0);

  function setState(next: Partial<ProximityState> | ProximityFile) {
    if ('destination' in next && next.destination !== undefined) {
      state.destination = next.destination
        ? {
            id: crypto.randomUUID(),
            name: next.destination.name,
            lat: next.destination.lat,
            lon: next.destination.lon,
          }
        : null;
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

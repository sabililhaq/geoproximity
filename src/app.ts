import L from "leaflet";
import {
  formatDistance,
  samePlace,
  withDistance,
  withNetworkDistance,
  type RouteError,
} from "./geo";
import { reverseGeocode, searchPlaces, type GeocodeHit } from "./geocoder";
import { parseProximityJson, type ProximityFile } from "./io";
import { encodeShareHash, readShareHash } from "./share";
import sampleProximity from "./sample-proximity.json";
import { cartoTileUrl, resolveCartoApiKey } from "./basemap";
import type { Place, ProximityState, DistanceMode } from "./types";

type RankedPlace = Place & {
  km: number;
  geometry?: Array<[number, number]>;
  /** Routing failed for this place; `km` is a straight-line fallback. */
  error?: RouteError;
};

const persisted: ProximityState = {
  destination: null,
  locations: [],
  distanceMode: "straight",
};

function parseCoordinates(input: string): { lat: number; lon: number } | null {
  const trimmed = input.trim();
  const match = trimmed.match(/^\s*([-\d.]+)\s*[,\s]\s*([-\d.]+)\s*$/);
  if (!match) return null;

  const lat = parseFloat(match[1]);
  const lon = parseFloat(match[2]);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  return { lat, lon };
}

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

function accentColor(): string {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim() || "#007acc"
  );
}

function destIcon(): L.DivIcon {
  return L.divIcon({
    className: "px-marker",
    html: '<span class="px-marker-dot"></span>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function locIcon(rank: number, selected = false): L.DivIcon {
  return L.divIcon({
    className: "px-marker",
    html: `<span class="px-marker-num${selected ? " is-selected" : ""}">${rank}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function bindSearch(
  root: HTMLElement,
  input: HTMLInputElement,
  results: HTMLElement,
  form: HTMLFormElement,
  onPick: (place: Place) => void,
  signal: AbortSignal,
): void {
  let timer = 0;
  let searchAbort: AbortController | null = null;
  let searchSeq = 0;

  const hide = () => {
    results.hidden = true;
    results.replaceChildren();
  };

  const renderHits = (hits: GeocodeHit[], unavailable = false) => {
    results.replaceChildren();
    if (hits.length === 0) {
      const empty = document.createElement("div");
      empty.className = "px-empty";
      empty.textContent = unavailable
        ? "Search is unavailable right now · try pasting coordinates (lat, lon)"
        : "No results";
      results.append(empty);
      results.hidden = false;
      return;
    }
    for (const hit of hits) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "px-hit";
      btn.textContent = hit.name;
      btn.addEventListener("click", () => {
        onPick({
          id: crypto.randomUUID(),
          name: hit.shortName || hit.name,
          lat: hit.lat,
          lon: hit.lon,
        });
        input.value = "";
        hide();
      });
      results.append(btn);
    }
    results.hidden = false;
  };

  let selectedResultIndex = -1;

  const run = async () => {
    const query = input.value.trim();
    const seq = ++searchSeq;
    selectedResultIndex = -1;
    if (query.length < 2) {
      hide();
      return;
    }

    const mode = input.getAttribute("data-input-mode") || "search";
    if (mode === "coords") {
      const coords = parseCoordinates(query);
      if (coords) {
        const name = `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`;
        onPick({
          id: crypto.randomUUID(),
          name,
          lat: coords.lat,
          lon: coords.lon,
        });
        input.value = "";
        hide();
        return;
      } else {
        results.replaceChildren();
        const error = document.createElement("div");
        error.className = "px-empty";
        error.textContent = "Invalid coordinates. Use format: lat, lon";
        results.append(error);
        results.hidden = false;
        return;
      }
    }

    searchAbort?.abort();
    searchAbort = new AbortController();
    results.hidden = false;
    results.textContent = "Searching…";
    const controller = searchAbort;
    const result = await searchPlaces(query, { signal: controller.signal });
    if (seq !== searchSeq || controller.signal.aborted) return;
    renderHits(result.hits, result.unavailable);
  };

  input.addEventListener(
    "input",
    () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void run(), 280);
    },
    { signal },
  );

  form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      window.clearTimeout(timer);
      void run();
    },
    { signal },
  );

  root.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target instanceof Node && !form.contains(event.target)) hide();
    },
    { signal },
  );

  input.addEventListener(
    "keydown",
    (e) => {
      const items = results.querySelectorAll(".px-hit");
      if (items.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          selectedResultIndex = Math.min(
            selectedResultIndex + 1,
            items.length - 1,
          );
          updateResultHighlight();
          break;
        case "ArrowUp":
          e.preventDefault();
          selectedResultIndex = Math.max(selectedResultIndex - 1, -1);
          updateResultHighlight();
          break;
        case "Enter":
          e.preventDefault();
          if (selectedResultIndex >= 0) {
            (items[selectedResultIndex] as HTMLElement).click();
          } else {
            void run();
          }
          break;
      }
    },
    { signal },
  );

  const updateResultHighlight = () => {
    const items = results.querySelectorAll(".px-hit");
    items.forEach((item, i) => {
      item.classList.toggle("is-keyboard-focused", i === selectedResultIndex);
    });
    if (selectedResultIndex >= 0) {
      (items[selectedResultIndex] as HTMLElement).scrollIntoView({
        block: "nearest",
      });
    }
  };

  const modeRadios = form.parentElement?.querySelectorAll(
    'input[type="radio"]',
  );
  if (modeRadios) {
    for (const radio of modeRadios) {
      radio.addEventListener(
        "change",
        () => {
          const newMode = (radio as HTMLInputElement).value;
          input.setAttribute("data-input-mode", newMode);
          input.placeholder =
            newMode === "coords"
              ? "e.g., 48.8566, 2.3522"
              : input.placeholder.includes("destination")
                ? "Search a destination"
                : "Add a city or place";
          input.value = "";
          hide();
        },
        { signal },
      );
    }
  }

  signal.addEventListener("abort", () => {
    window.clearTimeout(timer);
    searchAbort?.abort();
  });
}

export type StartProximityOptions = {
  sample?: boolean;
  share?: boolean;
  /** CARTO raster basemap key. Falls back to VITE_CARTO_API_KEY. */
  cartoApiKey?: string;
};

export function startProximity(
  root: HTMLElement,
  options: StartProximityOptions = {},
): () => void {
  const host = qs(root, "[data-proximity]");
  const mapEl = qs(root, "[data-px-map]");
  const destForm = qs<HTMLFormElement>(root, "[data-dest-form]");
  const destInput = qs<HTMLInputElement>(root, "[data-dest-input]");
  const destResults = qs(root, "[data-dest-results]");
  const destTools = qs(root, "[data-dest-tools]");
  const destCurrent = qs(root, "[data-dest-current]");
  const locForm = qs<HTMLFormElement>(root, "[data-loc-form]");
  const locInput = qs<HTMLInputElement>(root, "[data-loc-input]");
  const locResults = qs(root, "[data-loc-results]");
  const locList = qs<HTMLUListElement>(root, "[data-loc-list]");
  const locEmpty = qs(root, "[data-loc-empty]");
  const useLocationBtn = qs<HTMLButtonElement>(root, "[data-use-location]");
  const fitBtn = qs<HTMLButtonElement>(root, "[data-fit]");
  const clearBtn = qs<HTMLButtonElement>(root, "[data-clear]");
  const resizer = root.querySelector("[data-px-resizer]") as HTMLElement | null;
  const layout = root.querySelector(".px-layout") as HTMLElement | null;
  const shareBtn = qs<HTMLButtonElement>(root, "[data-share]");
  const sampleButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-sample]"),
  );
  const ioStatus = qs(root, "[data-io-status]");
  const hint = qs(root, "[data-px-hint]");
  const empty = qs(root, "[data-px-empty]");
  const routeModeButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-route-mode]"),
  );
  let statusTimer = 0;
  let isLoadingDistances = false;
  let selectedLocationId: string | null = null;
  let keyboardFocusedRowId: string | null = null;
  let currentRanked: RankedPlace[] = [];
  let distanceAbort: AbortController | null = null;
  shareBtn.hidden = !options.share;

  const session = new AbortController();
  const map = L.map(mapEl, { worldCopyJump: true }).setView([20, 0], 2);
  const cartoApiKey = resolveCartoApiKey(options.cartoApiKey);
  let tileErrorShown = false;
  const addTiles = () => {
    const layer = L.tileLayer(
      cartoTileUrl(document.documentElement.dataset.theme, cartoApiKey),
      { maxZoom: 19, subdomains: "abcd", attribution: CARTO_ATTRIBUTION },
    ).addTo(map);
    layer.on("tileerror", () => {
      if (tileErrorShown) return;
      tileErrorShown = true;
      showStatus(
        "Map tiles failed to load · check your connection or CARTO key",
      );
    });
    layer.on("load", () => {
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
    attributeFilter: ["data-theme"],
  });

  const resize = new ResizeObserver(() => map.invalidateSize());
  if (resizer && layout) {
    let isDragging = false;
    let isVertical = true;
    let startPos = 0;
    let startSize = 0;

    resizer.addEventListener("pointerdown", (e) => {
      isDragging = true;
      resizer.setPointerCapture(e.pointerId);
      isVertical = getComputedStyle(resizer).cursor === "row-resize";
      startPos = isVertical ? e.clientY : e.clientX;
      startSize = isVertical
        ? layout.querySelector(".px-sidebar")?.getBoundingClientRect().height ||
          0
        : layout.querySelector(".px-sidebar")?.getBoundingClientRect().width ||
          0;
      e.preventDefault();
    });

    resizer.addEventListener("pointermove", (e) => {
      if (!isDragging) return;
      const delta = isVertical ? startPos - e.clientY : e.clientX - startPos;
      const newSize = Math.max(200, startSize + delta);
      if (isVertical) {
        layout.style.setProperty("--px-sidebar-h", `${newSize}px`);
      } else {
        layout.style.setProperty("--px-sidebar-w", `${newSize}px`);
      }
      map.invalidateSize();
    });

    resizer.addEventListener("pointerup", (e) => {
      isDragging = false;
      resizer.releasePointerCapture(e.pointerId);
    });
    resizer.addEventListener("pointercancel", (e) => {
      isDragging = false;
      resizer.releasePointerCapture(e.pointerId);
    });
  }

  resize.observe(host);

  function focusRowByIndex(index: number, ranked: RankedPlace[]) {
    if (index < 0 || index >= ranked.length) return;
    const place = ranked[index];
    keyboardFocusedRowId = place.id;
    selectLocation(place.id, ranked, { fit: false });
  }

  function handleLocationListKeyboard(
    event: KeyboardEvent,
    ranked: RankedPlace[],
  ) {
    const currentIndex = ranked.findIndex((p) => p.id === keyboardFocusedRowId);

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusRowByIndex(currentIndex + 1, ranked);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusRowByIndex(currentIndex - 1, ranked);
        break;
      case "Enter":
        event.preventDefault();
        if (keyboardFocusedRowId) {
          selectLocation(keyboardFocusedRowId, ranked, { fit: true });
        }
        break;
      case "Escape":
        event.preventDefault();
        keyboardFocusedRowId = null;
        selectedLocationId = null;
        render();
        break;
      case "Backspace":
      case "Delete":
        event.preventDefault();
        if (keyboardFocusedRowId) {
          persisted.locations = persisted.locations.filter(
            (item) => item.id !== keyboardFocusedRowId,
          );
          keyboardFocusedRowId = null;
          render();
        }
        break;
      case "Home":
        event.preventDefault();
        focusRowByIndex(0, ranked);
        break;
      case "End":
        event.preventDefault();
        focusRowByIndex(ranked.length - 1, ranked);
        break;
    }
  }

  function rankedLocations(): RankedPlace[] {
    if (!persisted.destination) {
      return persisted.locations.map((place) => ({ ...place, km: Number.NaN }));
    }
    return withDistance(persisted.locations, persisted.destination);
  }

  async function rankedLocationsAsync(
    signal: AbortSignal,
  ): Promise<RankedPlace[]> {
    if (!persisted.destination) {
      return persisted.locations.map((place) => ({ ...place, km: Number.NaN }));
    }
    if (persisted.distanceMode === "straight") {
      return rankedLocations();
    }
    const mode = persisted.distanceMode === "driving" ? "driving" : "walking";
    return await withNetworkDistance(
      persisted.locations,
      persisted.destination,
      mode,
      signal,
    );
  }

  function fit(force = true) {
    const points: L.LatLngExpression[] = [];
    if (persisted.destination)
      points.push([persisted.destination.lat, persisted.destination.lon]);
    for (const place of persisted.locations)
      points.push([place.lat, place.lon]);
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
    if (mode === "driving") return "driving";
    if (mode === "walking") return "walking";
    return "straight-line";
  }

  function render() {
    if (persisted.distanceMode !== "straight") {
      void renderAsync();
    } else {
      doRender(rankedLocations());
    }
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
    host.classList.add("is-routing");
    hint.hidden = false;
    hint.textContent = `Fetching ${modeLabel(persisted.distanceMode)} routes…`;

    try {
      const ranked = await rankedLocationsAsync(signal);
      if (signal.aborted) return;
      const fallback = ranked.filter((place) => place.error).length;
      if (fallback > 0) {
        const label = modeLabel(persisted.distanceMode);
        showStatus(
          fallback === ranked.length
            ? `${label.charAt(0).toUpperCase()}${label.slice(1)} routing unavailable · showing straight-line distances.`
            : `No ${label} route for ${fallback} of ${ranked.length} locations · straight-line shown for those.`,
        );
      }
      isLoadingDistances = false;
      host.classList.remove("is-routing");
      for (const btn of routeModeButtons) {
        btn.disabled = false;
      }
      doRender(ranked);
    } catch (err) {
      if (!signal.aborted) {
        hint.textContent = `Could not fetch ${modeLabel(persisted.distanceMode)} routes · showing straight-line distance`;
      }
    } finally {
      if (distanceAbort === controller) {
        isLoadingDistances = false;
        distanceAbort = null;
        host.classList.remove("is-routing");
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
      const latlngs = place.geometry.map(
        ([lon, lat]) => [lat, lon] as L.LatLngExpression,
      );
      map.fitBounds(L.latLngBounds(latlngs), {
        padding: [48, 48],
        maxZoom: 14,
      });
    } else {
      map.setView([place.lat, place.lon], Math.max(map.getZoom(), 13));
    }
    markers.get(place.id)?.openPopup();
  }

  function selectLocation(
    placeId: string,
    ranked: RankedPlace[],
    selectOpts?: { fit?: boolean },
  ) {
    const nextId = selectedLocationId === placeId ? null : placeId;
    selectedLocationId = nextId;
    doRender(ranked, {
      fitSelection: Boolean(selectOpts?.fit && nextId),
    });
  }

  locList.addEventListener(
    "keydown",
    (e) => {
      handleLocationListKeyboard(e, currentRanked);
    },
    { signal: session.signal },
  );

  function doRender(
    ranked: RankedPlace[],
    renderOpts?: { fitSelection?: boolean },
  ) {
    currentRanked = ranked;
    const dest = persisted.destination;
    const color = accentColor();

    if (
      selectedLocationId &&
      !ranked.some((place) => place.id === selectedLocationId)
    ) {
      selectedLocationId = null;
    }

    for (const btn of routeModeButtons) {
      btn.setAttribute(
        "aria-pressed",
        btn.dataset.routeMode === persisted.distanceMode ? "true" : "false",
      );
    }

    overlay.clearLayers();
    const markers = new Map<string, L.Marker>();
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
      })
        .bindPopup(dest.name)
        .addTo(overlay);
      markers.set(dest.id, destMarker);

      destCurrent.hidden = false;
      destCurrent.classList.add("has-place");
      destCurrent.replaceChildren();
      const copy = document.createElement("div");
      copy.className = "px-dest-copy";
      const title = document.createElement("strong");
      title.textContent = dest.name;
      const meta = document.createElement("span");
      meta.textContent = `${dest.lat.toFixed(4)}, ${dest.lon.toFixed(4)}`;
      copy.append(title, meta);
      copy.title = "Show on map";
      copy.addEventListener("click", () => focusPlace(dest));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "px-dest-remove";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        selectedLocationId = null;
        persisted.destination = null;
        render();
      });
      destCurrent.append(copy, remove);
    } else {
      destCurrent.hidden = true;
      destCurrent.classList.remove("has-place");
      destCurrent.replaceChildren();
    }

    locList.replaceChildren();
    locEmpty.hidden = ranked.length > 0;
    locList.hidden = ranked.length === 0;
    for (const [index, place] of ranked.entries()) {
      const kmLabel = Number.isFinite(place.km)
        ? `${place.error ? "≈ " : ""}${formatDistance(place.km)}`
        : "";
      const isSelected = place.id === selectedLocationId;
      const locMarker = L.marker([place.lat, place.lon], {
        icon: locIcon(index + 1, isSelected),
        zIndexOffset: isSelected ? 550 : 400,
      })
        .bindPopup(kmLabel ? `${place.name} · ${kmLabel}` : place.name)
        .on("click", () => {
          selectLocation(place.id, ranked, { fit: true });
        })
        .addTo(overlay);
      markers.set(place.id, locMarker);
      if (dest) {
        const latlngs: L.LatLngExpression[] = place.geometry
          ? place.geometry.map(([lon, lat]) => [lat, lon])
          : [
              [place.lat, place.lon],
              [dest.lat, dest.lon],
            ];
        const dashArray = place.geometry ? undefined : "6 6";
        const dimmed = hasSelection && !isSelected;
        if (isSelected) {
          L.polyline(latlngs, {
            color,
            weight: 10,
            opacity: 0.22,
            dashArray,
            className: "px-edge px-edge-halo",
            interactive: false,
          }).addTo(overlay);
        }
        const line = L.polyline(latlngs, {
          color,
          weight: isSelected ? 5 : dimmed ? 2 : 2.5,
          opacity: isSelected ? 1 : dimmed ? 0.18 : 0.45,
          dashArray,
          className: isSelected
            ? "px-edge px-edge-highlight"
            : dimmed
              ? "px-edge px-edge-dim"
              : "px-edge",
          interactive: true,
        })
          .on("click", (event) => {
            L.DomEvent.stopPropagation(event);
            selectLocation(place.id, ranked, { fit: true });
          })
          .addTo(overlay);
        if (isSelected) selectedPolyline = line;
      }

      const row = document.createElement("li");
      row.className = isSelected ? "px-row is-selected" : "px-row";
      row.title = isSelected
        ? "Click again to clear highlight"
        : "Highlight route on map";
      row.setAttribute("aria-current", isSelected ? "true" : "false");
      const rank = document.createElement("span");
      rank.className = "px-rank";
      rank.textContent = String(index + 1);
      const name = document.createElement("span");
      name.className = "px-row-name";
      name.textContent = place.name;
      name.title = place.name;
      const dist = document.createElement("span");
      dist.className = place.error ? "px-row-dist is-approx" : "px-row-dist";
      dist.textContent = kmLabel || "—";
      if (place.error) {
        dist.title =
          place.error === "no_route"
            ? `No ${modeLabel(persisted.distanceMode)} route found · straight-line estimate`
            : "Routing service unavailable · straight-line estimate";
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "px-row-remove";
      remove.setAttribute("aria-label", `Remove ${place.name}`);
      remove.textContent = "×";
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        if (selectedLocationId === place.id) selectedLocationId = null;
        persisted.locations = persisted.locations.filter(
          (item) => item.id !== place.id,
        );
        render();
      });
      row.addEventListener("click", () => {
        selectLocation(place.id, ranked, { fit: true });
      });
      row.addEventListener("keydown", (e) => {
        handleLocationListKeyboard(e, ranked);
      });
      row.addEventListener("focus", () => {
        keyboardFocusedRowId = place.id;
      });
      row.setAttribute("tabindex", "0");
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

    const hasNodes = Boolean(dest) || persisted.locations.length > 0;
    const selected = selectedLocationId
      ? ranked.find((place) => place.id === selectedLocationId)
      : undefined;
    if (isLoadingDistances) {
      hint.textContent = `Fetching ${modeLabel(persisted.distanceMode)} routes…`;
    } else if (selected) {
      const label = Number.isFinite(selected.km)
        ? `${selected.name} · ${selected.error ? "≈ " : ""}${formatDistance(selected.km)}`
        : selected.name;
      hint.textContent = `Highlighted: ${label} · click again to clear`;
    } else if (dest) {
      const approx = ranked.filter((place) => place.error).length;
      const label = modeLabel(persisted.distanceMode);
      hint.textContent =
        persisted.distanceMode === "straight"
          ? "Click a location or path to highlight"
          : approx === 0
            ? `Showing ${label} routes · click to highlight`
            : approx === ranked.length
              ? `${label.charAt(0).toUpperCase()}${label.slice(1)} routing unavailable · showing straight-line distances`
              : `Showing ${label} routes · ${approx} of ${ranked.length} fell back to straight-line`;
    } else {
      hint.textContent = "Click the map to set a destination";
    }
    hint.hidden = !hasNodes;
    empty.hidden = hasNodes;
    fitBtn.disabled = !hasNodes;
    clearBtn.disabled = !hasNodes;

    if (options.share) {
      window.history.replaceState(null, "", `#${encodeShareHash(persisted)}`);
    }
  }

  function showStatus(message: string) {
    ioStatus.hidden = false;
    ioStatus.textContent = message;
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => {
      ioStatus.hidden = true;
      ioStatus.textContent = "";
    }, 3200);
  }

  function applyFile(data: ProximityFile) {
    selectedLocationId = null;
    persisted.destination = data.destination
      ? { id: crypto.randomUUID(), ...data.destination }
      : null;
    persisted.locations = data.locations.map((node) => ({
      id: crypto.randomUUID(),
      ...node,
    }));
    render();
    fit(true);
  }

  function setDestination(place: Place) {
    persisted.destination = place;
    persisted.locations = persisted.locations.filter(
      (item) => !samePlace(item, place),
    );
    render();
    fit();
  }

  function addLocation(place: Place) {
    if (persisted.destination && samePlace(persisted.destination, place))
      return;
    if (persisted.locations.some((item) => samePlace(item, place))) return;
    persisted.locations.push(place);
    render();
    fit();
  }

  bindSearch(
    root,
    destInput,
    destResults,
    destForm,
    setDestination,
    session.signal,
  );
  bindSearch(root, locInput, locResults, locForm, addLocation, session.signal);

  useLocationBtn.addEventListener(
    "click",
    () => {
      if (!navigator.geolocation) {
        showStatus("Location services not available on this device");
        return;
      }
      useLocationBtn.disabled = true;
      useLocationBtn.textContent = "Locating…";
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const name = await reverseGeocode(lat, lon, session.signal);
          if (session.signal.aborted) return;
          setDestination({
            id: crypto.randomUUID(),
            name: name || "My location",
            lat,
            lon,
          });
          useLocationBtn.disabled = false;
          useLocationBtn.textContent = "Use my location";
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            showStatus("Enable location permission in browser settings");
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            showStatus("Location not available (check GPS/connection)");
          } else if (error.code === error.TIMEOUT) {
            showStatus("Location request timed out");
          } else {
            showStatus("Could not determine location");
          }
          useLocationBtn.disabled = false;
          useLocationBtn.textContent = "Use my location";
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    },
    { signal: session.signal },
  );

  fitBtn.addEventListener("click", () => fit(true), { signal: session.signal });

  function loadSample(announce = true) {
    const result = parseProximityJson(JSON.stringify(sampleProximity));
    if (!result.ok) {
      showStatus(result.error);
      return;
    }
    applyFile(result.data);
    if (!announce) return;
    const count =
      result.data.locations.length + (result.data.destination ? 1 : 0);
    showStatus(`Loaded sample · ${count} nodes.`);
  }

  for (const btn of sampleButtons) {
    btn.addEventListener("click", () => loadSample(true), {
      signal: session.signal,
    });
  }

  if (options.share) {
    shareBtn.setAttribute("aria-label", "Share this comparison");
    shareBtn.addEventListener(
      "click",
      async () => {
        const url = window.location.href;

        try {
          if (navigator.share) {
            try {
              await navigator.share({
                title: "Proximity",
                text: "Compare destinations by proximity.",
                url,
              });
              showStatus("Share sheet opened.");
              return;
            } catch (error) {
              if (
                error instanceof DOMException &&
                error.name === "AbortError"
              ) {
                showStatus("Share cancelled.");
                return;
              }
            }
          }

          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(url);
            showStatus("Link copied to clipboard.");
            return;
          }

          const temp = document.createElement("textarea");
          temp.value = url;
          temp.setAttribute("readonly", "true");
          temp.style.position = "fixed";
          temp.style.top = "-9999px";
          document.body.append(temp);
          temp.select();
          document.execCommand("copy");
          temp.remove();
          showStatus("Link copied to clipboard.");
        } catch {
          showStatus("Could not copy link.");
        }
      },
      { signal: session.signal },
    );
  }

  clearBtn.addEventListener(
    "click",
    () => {
      selectedLocationId = null;
      persisted.destination = null;
      persisted.locations = [];
      render();
      fit(true);
    },
    { signal: session.signal },
  );

  for (const btn of routeModeButtons) {
    btn.addEventListener(
      "click",
      () => {
        const mode = btn.dataset.routeMode as DistanceMode;
        if (!mode) return;
        if (mode === persisted.distanceMode) return;
        selectedLocationId = null;
        persisted.distanceMode = mode;
        render();
      },
      { signal: session.signal },
    );
  }

  map.on("click", (event: L.LeafletMouseEvent) => {
    const { lat, lng } = event.latlng;
    void reverseGeocode(lat, lng, session.signal).then((name) => {
      if (session.signal.aborted) return;
      const place: Place = { id: crypto.randomUUID(), name, lat, lon: lng };
      if (!persisted.destination) setDestination(place);
      else addLocation(place);
    });
  });

  host.addEventListener(
    "keydown",
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        const input =
          document.activeElement?.id === "px-dest-input" ? locInput : destInput;
        input.focus();
        input.select();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "C") {
        e.preventDefault();
        selectedLocationId = null;
        keyboardFocusedRowId = null;
        persisted.destination = null;
        persisted.locations = [];
        render();
        fit(true);
      }
    },
    { signal: session.signal },
  );

  const shared = options.share ? readShareHash(window.location.hash) : null;
  if (shared) {
    applyFile(shared);
    const count = shared.locations.length + (shared.destination ? 1 : 0);
    showStatus(`Loaded from shared link · ${count} nodes.`);
  } else if (
    options.sample &&
    !persisted.destination &&
    persisted.locations.length === 0
  ) {
    loadSample(false);
  } else {
    render();
  }
  window.setTimeout(() => map.invalidateSize(), 0);

  return () => {
    session.abort();
    distanceAbort?.abort();
    window.clearTimeout(statusTimer);
    themeObs.disconnect();
    resize.disconnect();
    maps.delete(root);
    map.remove();
  };
}

import L from "leaflet";
import { formatDistance, samePlace, withDistance } from "./geo";
import { reverseGeocode, searchLocation, type GeocodeHit } from "./geocoder";
import {
  parseProximityJson,
  serializeProximity,
  type ProximityFile,
} from "./io";
import sampleProximity from "./sample-proximity.json";
import type { Place, ProximityState } from "./types";

const persisted: ProximityState = {
  destination: null,
  locations: [],
  unit: "km",
};

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

function tileUrl(theme: string | undefined): string {
  return theme === "dark"
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
}

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

function locIcon(rank: number): L.DivIcon {
  return L.divIcon({
    className: "px-marker",
    html: `<span class="px-marker-num">${rank}</span>`,
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

  const renderHits = (hits: GeocodeHit[]) => {
    results.replaceChildren();
    if (hits.length === 0) {
      const empty = document.createElement("div");
      empty.className = "px-empty";
      empty.textContent = "No results";
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

  const run = async () => {
    const query = input.value.trim();
    const seq = ++searchSeq;
    if (query.length < 2) {
      hide();
      return;
    }
    searchAbort?.abort();
    searchAbort = new AbortController();
    results.hidden = false;
    results.textContent = "Searching…";
    const controller = searchAbort;
    const hits = await searchLocation(query, { signal: controller.signal });
    if (seq !== searchSeq || controller.signal.aborted) return;
    renderHits(hits);
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

  signal.addEventListener("abort", () => {
    window.clearTimeout(timer);
    searchAbort?.abort();
  });
}

export function startProximity(root: HTMLElement): () => void {
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
  const importBtn = qs<HTMLButtonElement>(root, "[data-import]");
  const exportBtn = qs<HTMLButtonElement>(root, "[data-export]");
  const sampleButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-sample]"),
  );
  const importFile = qs<HTMLInputElement>(root, "[data-import-file]");
  const ioStatus = qs(root, "[data-io-status]");
  const hint = qs(root, "[data-px-hint]");
  const empty = qs(root, "[data-px-empty]");
  const unitButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-unit]"),
  );
  let statusTimer = 0;

  const session = new AbortController();
  const map = L.map(mapEl, { worldCopyJump: true }).setView([20, 0], 2);
  let tiles = L.tileLayer(tileUrl(document.documentElement.dataset.theme), {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap &copy; CARTO",
  }).addTo(map);
  const overlay = L.layerGroup().addTo(map);
  maps.set(root, map);

  const themeObs = new MutationObserver(() => {
    tiles.remove();
    tiles = L.tileLayer(tileUrl(document.documentElement.dataset.theme), {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap &copy; CARTO",
    }).addTo(map);
    overlay.addTo(map);
  });
  themeObs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  const resize = new ResizeObserver(() => map.invalidateSize());
  resize.observe(host);

  function rankedLocations() {
    if (!persisted.destination) {
      return persisted.locations.map((place) => ({ ...place, km: Number.NaN }));
    }
    return withDistance(persisted.locations, persisted.destination);
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

  function render() {
    const dest = persisted.destination;
    const ranked = rankedLocations();
    const color = accentColor();

    for (const btn of unitButtons) {
      btn.setAttribute(
        "aria-pressed",
        btn.dataset.unit === persisted.unit ? "true" : "false",
      );
    }

    overlay.clearLayers();
    const markers = new Map<string, L.Marker>();

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
        ? formatDistance(place.km, persisted.unit)
        : "";
      const locMarker = L.marker([place.lat, place.lon], {
        icon: locIcon(index + 1),
        zIndexOffset: 400,
      })
        .bindPopup(kmLabel ? `${place.name} · ${kmLabel}` : place.name)
        .addTo(overlay);
      markers.set(place.id, locMarker);
      if (dest) {
        L.polyline(
          [
            [place.lat, place.lon],
            [dest.lat, dest.lon],
          ],
          { color, weight: 2, opacity: 0.7, dashArray: "6 6" },
        ).addTo(overlay);
      }

      const row = document.createElement("li");
      row.className = "px-row";
      row.title = "Show on map";
      const rank = document.createElement("span");
      rank.className = "px-rank";
      rank.textContent = String(index + 1);
      const name = document.createElement("span");
      name.className = "px-row-name";
      name.textContent = place.name;
      name.title = place.name;
      const dist = document.createElement("span");
      dist.className = "px-row-dist";
      dist.textContent = kmLabel || "—";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "px-row-remove";
      remove.setAttribute("aria-label", `Remove ${place.name}`);
      remove.textContent = "×";
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        persisted.locations = persisted.locations.filter(
          (item) => item.id !== place.id,
        );
        render();
      });
      row.addEventListener("click", () => focusPlace(place));
      row.append(rank, name, dist, remove);
      locList.append(row);
    }

    const hasNodes = Boolean(dest) || persisted.locations.length > 0;
    hint.textContent = dest
      ? "Click the map to add a location"
      : "Click the map to set a destination";
    hint.hidden = !hasNodes;
    empty.hidden = hasNodes;
    fitBtn.disabled = !hasNodes;
    clearBtn.disabled = !hasNodes;
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
        useLocationBtn.textContent = "Location unavailable";
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
        () => {
          useLocationBtn.disabled = false;
          useLocationBtn.textContent = "Use my location";
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    },
    { signal: session.signal },
  );

  fitBtn.addEventListener("click", () => fit(true), { signal: session.signal });

  function loadSample() {
    const result = parseProximityJson(JSON.stringify(sampleProximity));
    if (!result.ok) {
      showStatus(result.error);
      return;
    }
    applyFile(result.data);
    const count =
      result.data.locations.length + (result.data.destination ? 1 : 0);
    showStatus(`Loaded sample · ${count} nodes.`);
  }

  importBtn.addEventListener("click", () => importFile.click(), {
    signal: session.signal,
  });

  for (const btn of sampleButtons) {
    btn.addEventListener("click", loadSample, { signal: session.signal });
  }

  exportBtn.addEventListener(
    "click",
    () => {
      const text = serializeProximity({
        destination: persisted.destination
          ? {
              name: persisted.destination.name,
              lat: persisted.destination.lat,
              lon: persisted.destination.lon,
            }
          : null,
        locations: persisted.locations.map((place) => ({
          name: place.name,
          lat: place.lat,
          lon: place.lon,
        })),
      });
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "proximity.json";
      link.click();
      URL.revokeObjectURL(url);
      showStatus("Exported JSON nodes.");
    },
    { signal: session.signal },
  );

  importFile.addEventListener(
    "change",
    () => {
      const file = importFile.files?.[0];
      importFile.value = "";
      if (!file) return;
      void file.text().then((text) => {
        const result = parseProximityJson(text);
        if (!result.ok) {
          showStatus(result.error);
          return;
        }
        applyFile(result.data);
        const count =
          result.data.locations.length + (result.data.destination ? 1 : 0);
        showStatus(`Imported ${count} node${count === 1 ? "" : "s"}.`);
      });
    },
    { signal: session.signal },
  );

  clearBtn.addEventListener(
    "click",
    () => {
      persisted.destination = null;
      persisted.locations = [];
      render();
      fit(true);
    },
    { signal: session.signal },
  );

  for (const btn of unitButtons) {
    btn.addEventListener(
      "click",
      () => {
        persisted.unit = btn.dataset.unit === "mi" ? "mi" : "km";
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

  render();
  window.setTimeout(() => map.invalidateSize(), 0);

  return () => {
    session.abort();
    window.clearTimeout(statusTimer);
    themeObs.disconnect();
    resize.disconnect();
    maps.delete(root);
    map.remove();
  };
}

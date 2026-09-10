import { searchPlaces, type GeocodeHit } from './geocoder';
import { parsePlaceInput, parsePlaceLines } from './parse-place';
import type { Place } from './types';

export function bindSearch(
  root: HTMLElement,
  input: HTMLInputElement,
  results: HTMLElement,
  form: HTMLFormElement,
  onPick: (place: Place) => void,
  signal: AbortSignal,
  getBias?: () => { lat: number; lon: number } | null,
  onBulkNotice?: (message: string) => void,
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
      const empty = document.createElement('div');
      empty.className = 'px-empty';
      if (unavailable) {
        empty.append('Search is unavailable right now · ');
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'px-retry';
        retry.textContent = 'Retry search';
        retry.addEventListener('click', () => void run());
        empty.append(retry);
      } else {
        empty.textContent = 'No results';
      }
      results.append(empty);
      results.hidden = false;
      return;
    }
    for (const hit of hits) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'px-hit';
      const title = document.createElement('strong');
      title.className = 'px-hit-title';
      title.textContent = hit.shortName || hit.name;
      const context = document.createElement('span');
      context.className = 'px-hit-context';
      context.textContent = hit.name !== hit.shortName ? hit.name : '';
      btn.append(title, context);
      btn.addEventListener('click', () => {
        onPick({
          id: crypto.randomUUID(),
          name: hit.shortName || hit.name,
          lat: hit.lat,
          lon: hit.lon,
        });
        input.value = '';
        hide();
      });
      results.append(btn);
    }
    results.hidden = false;
  };

  let selectedResultIndex = -1;

  const updateResultHighlight = () => {
    const items = results.querySelectorAll('.px-hit');
    items.forEach((item, i) => {
      item.classList.toggle('is-keyboard-focused', i === selectedResultIndex);
    });
    if (selectedResultIndex >= 0) {
      (items[selectedResultIndex] as HTMLElement).scrollIntoView({
        block: 'nearest',
      });
    }
  };

  const run = async () => {
    const query = input.value.trim();
    const seq = ++searchSeq;
    selectedResultIndex = -1;
    if (query.length < 2) {
      hide();
      return;
    }

    const coords = parsePlaceInput(query);
    if (coords) {
      const name = `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`;
      onPick({
        id: crypto.randomUUID(),
        name,
        lat: coords.lat,
        lon: coords.lon,
      });
      input.value = '';
      hide();
      return;
    }

    searchAbort?.abort();
    searchAbort = new AbortController();
    results.hidden = false;
    results.textContent = 'Searching…';
    const controller = searchAbort;
    const bias = getBias?.() ?? undefined;
    const result = await searchPlaces(query, {
      signal: controller.signal,
      bias: bias ?? undefined,
    });
    if (seq !== searchSeq || controller.signal.aborted) return;
    renderHits(result.hits, result.unavailable);
  };

  input.addEventListener(
    'input',
    () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void run(), 400);
    },
    { signal },
  );

  input.addEventListener(
    'paste',
    (event) => {
      const text = event.clipboardData?.getData('text') ?? '';
      if (!text.includes('\n')) return;
      const places = parsePlaceLines(text);
      if (places.length === 0) return;

      event.preventDefault();
      window.clearTimeout(timer);
      searchAbort?.abort();
      for (const place of places) {
        onPick({
          id: crypto.randomUUID(),
          name: `${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}`,
          lat: place.lat,
          lon: place.lon,
        });
      }
      input.value = '';
      hide();
      onBulkNotice?.(`Added ${places.length} locations from pasted coordinates.`);
    },
    { signal },
  );

  form.addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      window.clearTimeout(timer);
      void run();
    },
    { signal },
  );

  root.addEventListener(
    'pointerdown',
    (event) => {
      if (event.target instanceof Node && !form.contains(event.target)) hide();
    },
    { signal },
  );

  input.addEventListener(
    'keydown',
    (e) => {
      const items = results.querySelectorAll('.px-hit');
      if (items.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          selectedResultIndex = Math.min(selectedResultIndex + 1, items.length - 1);
          updateResultHighlight();
          break;
        case 'ArrowUp':
          e.preventDefault();
          selectedResultIndex = Math.max(selectedResultIndex - 1, -1);
          updateResultHighlight();
          break;
        case 'Enter':
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

  signal.addEventListener('abort', () => {
    window.clearTimeout(timer);
    searchAbort?.abort();
  });
}

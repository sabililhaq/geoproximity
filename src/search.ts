import { searchPlaces, type GeocodeHit } from './geocoder';
import { parsePlaceInput } from './parse-place';
import type { Place } from './types';

export function bindSearch(
  root: HTMLElement,
  input: HTMLInputElement,
  results: HTMLElement,
  form: HTMLFormElement,
  onPick: (place: Place) => void,
  signal: AbortSignal,
  getBias?: () => { lat: number; lon: number } | null,
  allowBulk = false,
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
        empty.append(
          retry,
          '. You can also paste latitude, longitude or click the map to place a pin.',
        );
      } else {
        empty.textContent =
          'No results. Try adding the city, paste latitude, longitude, or click the map to place a pin.';
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

  type BulkOption = GeocodeHit;
  type BulkResolution = { input: string; options: BulkOption[] };

  const renderBulkReview = (resolutions: BulkResolution[]) => {
    results.replaceChildren();
    const review = document.createElement('div');
    review.className = 'px-bulk-review';
    const heading = document.createElement('strong');
    heading.textContent = `Review ${resolutions.length} pasted places`;
    review.append(heading);

    const selects = resolutions.map((resolution) => {
      const row = document.createElement('label');
      row.className = 'px-bulk-row';
      const source = document.createElement('span');
      source.className = 'px-bulk-source';
      source.textContent = resolution.input;
      const select = document.createElement('select');
      select.disabled = resolution.options.length === 0;
      select.setAttribute('aria-label', `Match for ${resolution.input}`);
      if (resolution.options.length === 0) {
        const option = document.createElement('option');
        option.textContent = 'No match found';
        select.append(option);
      } else {
        for (const [index, optionValue] of resolution.options.entries()) {
          const option = document.createElement('option');
          option.value = String(index);
          option.textContent = optionValue.name;
          select.append(option);
        }
      }
      row.append(source, select);
      review.append(row);
      return select;
    });

    const actions = document.createElement('div');
    actions.className = 'px-bulk-actions';
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'px-bulk-add';
    add.textContent = 'Add selected';
    add.disabled = resolutions.every((resolution) => resolution.options.length === 0);
    add.addEventListener('click', () => {
      let count = 0;
      for (const [index, select] of selects.entries()) {
        const resolution = resolutions[index]!;
        const option = resolution.options[Number(select.value)];
        if (!option) continue;
        onPick({
          id: crypto.randomUUID(),
          name: option.shortName || option.name,
          lat: option.lat,
          lon: option.lon,
        });
        count++;
      }
      input.value = '';
      hide();
      onBulkNotice?.(`Added ${count} pasted places.`);
    });
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'px-bulk-cancel';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', hide);
    actions.append(add, cancel);
    review.append(actions);
    results.append(review);
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

  const run = async (confirmCoordinates = false) => {
    searchAbort?.abort();
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
      if (!confirmCoordinates) {
        renderHits([{ name, shortName: name, lat: coords.lat, lon: coords.lon }]);
        results.querySelector('strong')!.textContent = `Add ${name}`;
        return;
      }
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
    if (/^https?:\/\//i.test(query)) {
      results.replaceChildren();
      const help = document.createElement('div');
      help.className = 'px-empty';
      help.textContent =
        'This link does not contain usable coordinates. Open the place in Google Maps, copy its latitude and longitude, and paste them here. Or click the map to place a pin.';
      results.append(help);
      results.hidden = false;
      return;
    }
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
      searchAbort?.abort();
      searchSeq++;
      selectedResultIndex = -1;
      hide();
      timer = window.setTimeout(() => void run(), 400);
    },
    { signal },
  );

  input.addEventListener(
    'paste',
    (event) => {
      if (!allowBulk) return;
      const text = event.clipboardData?.getData('text') ?? '';
      if (!text.includes('\n')) return;
      const lines = [
        ...new Set(
          text
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean),
        ),
      ].slice(0, 20);
      if (lines.length === 0) return;

      const coordinates = lines.map((line) => parsePlaceInput(line));
      if (coordinates.every((place): place is NonNullable<typeof place> => place !== null)) {
        event.preventDefault();
        window.clearTimeout(timer);
        searchAbort?.abort();
        renderBulkReview(
          coordinates.map((place, index) => {
            const name = `${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}`;
            return { input: lines[index]!, options: [{ name, shortName: name, ...place }] };
          }),
        );
        return;
      }

      event.preventDefault();
      window.clearTimeout(timer);
      searchAbort?.abort();
      void resolveBulk(lines);
    },
    { signal },
  );

  async function resolveBulk(lines: string[]) {
    const controller = new AbortController();
    searchAbort?.abort();
    searchAbort = controller;
    results.hidden = false;
    results.textContent = `Resolving pasted places…`;
    const resolutions: BulkResolution[] = [];
    const bias = getBias?.() ?? undefined;

    for (const line of lines) {
      if (controller.signal.aborted) return;
      const coords = parsePlaceInput(line);
      if (coords) {
        const formatted = `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`;
        resolutions.push({
          input: line,
          options: [{ name: formatted, shortName: formatted, lat: coords.lat, lon: coords.lon }],
        });
        continue;
      }
      if (/^https?:\/\//i.test(line)) {
        resolutions.push({ input: line, options: [] });
        continue;
      }
      const result = await searchPlaces(line, {
        limit: 5,
        signal: controller.signal,
        bias: bias ?? undefined,
      });
      if (controller.signal.aborted) return;
      resolutions.push({ input: line, options: result.hits });
    }

    renderBulkReview(resolutions);
  }

  form.addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      window.clearTimeout(timer);
      void run(true);
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
          window.clearTimeout(timer);
          if (selectedResultIndex >= 0) {
            (items[selectedResultIndex] as HTMLElement).click();
          } else {
            void run(true);
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

// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mountProximity } from '../src/mount';

const dest = { name: 'Paris', lat: 48.8566, lon: 2.3522 };
const london = { name: 'London', lat: 51.5074, lon: -0.1278 };
const brussels = { name: 'Brussels', lat: 50.8503, lon: 4.3517 };
const amsterdam = { name: 'Amsterdam', lat: 52.3676, lon: 4.9041 };

function shareHash(data: unknown): string {
  return `#proximity=${encodeURIComponent(JSON.stringify(data))}`;
}

function mountWithHash(data: unknown) {
  window.location.hash = shareHash(data);
  const root = document.createElement('div');
  document.body.append(root);
  const stop = mountProximity(root, { share: true });
  return { root, stop };
}

function rows(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.px-row'));
}

function selectedRank(root: HTMLElement): string | null {
  return root.querySelector('.px-row.is-selected .px-rank')?.textContent ?? null;
}

function key(target: Element, key: string) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

const storage = new Map<string, string>();
const localStorageStub: Storage = {
  get length() {
    return storage.size;
  },
  clear: () => storage.clear(),
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => {
    storage.set(key, String(value));
  },
  removeItem: (key) => {
    storage.delete(key);
  },
  key: (index) => [...storage.keys()][index] ?? null,
};

beforeAll(() => {
  vi.stubGlobal('localStorage', localStorageStub);
  // jsdom lacks these browser APIs that the widget touches at mount.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.matchMedia = () =>
    ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
  Element.prototype.scrollIntoView = () => {};
  // Tiles and geocoders are network calls; never hit them from unit tests.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('[]')),
  );
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const stop of cleanups.splice(0)) stop();
  document.body.replaceChildren();
  window.location.hash = '';
  storage.clear();
});

describe('popup content', () => {
  it('renders place names as text, not HTML', () => {
    const evil = '<img src=x onerror="window.__pwned=1">Evil';
    const { root, stop } = mountWithHash({
      destination: dest,
      locations: [{ ...london, name: evil }],
    });
    cleanups.push(stop);

    const marker = root.querySelector<HTMLElement>('.px-marker-num');
    expect(marker).not.toBeNull();
    const icon = marker!.closest('.leaflet-marker-icon');
    expect(icon?.getAttribute('aria-label')).toContain('Evil');
    expect(icon?.getAttribute('aria-label')).toContain('rank 1');
    marker!.parentElement!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const popup = root.querySelector('.leaflet-popup-content');
    expect(popup).not.toBeNull();
    expect(popup!.querySelector('img')).toBeNull();
    expect(popup!.textContent).toContain(evil);
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });
});

describe('location list keyboard navigation', () => {
  it('moves one row per ArrowDown and keeps DOM focus on the row', () => {
    const { root, stop } = mountWithHash({
      destination: dest,
      locations: [london, brussels, amsterdam],
    });
    cleanups.push(stop);

    const list = root.querySelector('[data-loc-list]')!;
    expect(list.getAttribute('role')).toBe('listbox');
    expect(rows(root)[0]!.getAttribute('role')).toBe('option');
    rows(root)[0]!.focus();
    key(document.activeElement!, 'ArrowDown');

    expect(selectedRank(root)).toBe('2');
    expect(document.activeElement).toBe(rows(root)[1]);

    key(document.activeElement!, 'ArrowDown');
    expect(selectedRank(root)).toBe('3');
    expect(document.activeElement).toBe(rows(root)[2]);

    // Clamped at the end.
    key(document.activeElement!, 'ArrowDown');
    expect(selectedRank(root)).toBe('3');
    expect(list.contains(document.activeElement)).toBe(true);
  });

  it('toggles the highlight exactly once on Enter', () => {
    const { root, stop } = mountWithHash({
      destination: dest,
      locations: [london, brussels],
    });
    cleanups.push(stop);

    rows(root)[1]!.focus();
    key(document.activeElement!, 'Enter');
    expect(selectedRank(root)).toBe('2');
    expect(document.activeElement).toBe(rows(root)[1]);

    key(document.activeElement!, 'Enter');
    expect(selectedRank(root)).toBeNull();
  });

  it('removes the focused row on Delete and moves focus to a neighbour', () => {
    const { root, stop } = mountWithHash({
      destination: dest,
      locations: [london, brussels, amsterdam],
    });
    cleanups.push(stop);

    rows(root)[0]!.focus();
    key(document.activeElement!, 'Delete');

    const names = rows(root).map((row) => row.querySelector('.px-row-name')!.textContent);
    expect(names).toEqual(['London', 'Amsterdam']); // Brussels ranked first (closest to Paris)
    expect(document.activeElement).toBe(rows(root)[0]);
  });
});

describe('programmatic API', () => {
  it('reads and writes state and notifies onChange', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const handle = mountProximity(root, {});
    cleanups.push(handle);

    const seen: string[] = [];
    const off = handle.onChange((state) => {
      seen.push(state.destination?.name ?? '');
    });

    handle.setState({
      destination: dest,
      locations: [london],
    });
    expect(handle.getState().destination?.name).toBe('Paris');
    expect(rows(root).map((row) => row.querySelector('.px-row-name')!.textContent)).toEqual([
      'London',
    ]);
    expect(seen).toContain('Paris');
    off();
  });
});

describe('localStorage', () => {
  it('restores the last comparison without a share link', () => {
    const { root, stop } = mountWithHash({
      destination: dest,
      locations: [london],
    });
    expect(rows(root)).toHaveLength(1);
    stop();
    root.remove();
    window.location.hash = '';

    const next = document.createElement('div');
    document.body.append(next);
    cleanups.push(mountProximity(next, {}));
    expect(rows(next).map((row) => row.querySelector('.px-row-name')!.textContent)).toEqual([
      'London',
    ]);
  });
});

describe('undo', () => {
  it('restores locations after clear', () => {
    const { root, stop } = mountWithHash({
      destination: dest,
      locations: [london, brussels],
    });
    cleanups.push(stop);

    expect(rows(root).length).toBeGreaterThan(0);
    root.querySelector<HTMLButtonElement>('[data-clear]')!.click();
    expect(rows(root)).toHaveLength(0);
    root.querySelector<HTMLButtonElement>('.px-undo')!.click();
    expect(rows(root).map((row) => row.querySelector('.px-row-name')!.textContent)).toEqual([
      'Brussels',
      'London',
    ]);
  });
});

describe('inline rename', () => {
  it('renames a location on double-click', () => {
    const { root, stop } = mountWithHash({
      destination: dest,
      locations: [london],
    });
    cleanups.push(stop);

    const name = rows(root)[0]!.querySelector('.px-row-name')!;
    name.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const input = root.querySelector<HTMLInputElement>('.px-row-rename');
    expect(input).not.toBeNull();
    input!.value = 'Heathrow';
    input!.dispatchEvent(new Event('blur'));
    expect(rows(root)[0]!.querySelector('.px-row-name')!.textContent).toBe('Heathrow');
  });
});

describe('bulk location paste', () => {
  it('adds unique coordinate lines and reports the count', () => {
    const { root, stop } = mountWithHash({ destination: dest, locations: [] });
    cleanups.push(stop);

    const input = root.querySelector<HTMLInputElement>('[data-loc-input]')!;
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        getData: () => '51.5074, -0.1278\n51.5074, -0.1278\n50.8503, 4.3517',
      },
    });
    input.dispatchEvent(event);

    expect(rows(root).map((row) => row.querySelector('.px-row-name')!.textContent)).toEqual([
      '50.8503, 4.3517',
      '51.5074, -0.1278',
    ]);
    expect(root.querySelector('[data-io-status]')?.textContent).toBe(
      'Added 2 locations from pasted coordinates.',
    );
  });
});

describe('map-less view', () => {
  it('toggles the full-width comparison layout', () => {
    const { root, stop } = mountWithHash({ destination: dest, locations: [london] });
    cleanups.push(stop);

    const toggle = root.querySelector<HTMLButtonElement>('[data-mapless-toggle]')!;
    expect(root.querySelector('[data-proximity]')?.classList.contains('px-mapless')).toBe(false);
    toggle.click();
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(root.querySelector('[data-proximity]')?.classList.contains('px-mapless')).toBe(true);
    toggle.click();
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(root.querySelector('[data-proximity]')?.classList.contains('px-mapless')).toBe(false);
  });
});

describe('scale ruler visibility', () => {
  it('shows the ruler by default and can hide it', () => {
    const { root, stop } = mountWithHash({ destination: dest, locations: [] });
    cleanups.push(stop);

    const host = root.querySelector<HTMLElement>('[data-proximity]')!;
    const toggle = root.querySelector<HTMLButtonElement>('[data-scale-toggle]')!;
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(host.classList.contains('px-hide-scale')).toBe(false);
    toggle.click();
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(host.classList.contains('px-hide-scale')).toBe(true);
  });
});

describe('mobile keyboard viewport', () => {
  it('keeps the host anchored while the visual viewport shrinks', () => {
    const previousViewport = window.visualViewport;
    const listeners = new Map<string, () => void>();
    const viewport = {
      height: window.innerHeight,
      offsetTop: 0,
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        listeners.set(type, listener as () => void);
      },
      removeEventListener: () => {},
    } as unknown as VisualViewport;
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: viewport,
    });

    try {
      const { root, stop } = mountWithHash({ destination: dest, locations: [] });
      cleanups.push(stop);
      const host = root.querySelector<HTMLElement>('[data-proximity]')!;

      viewport.height = 500;
      viewport.offsetTop = 24;
      listeners.get('resize')!();

      expect(host.classList.contains('is-keyboard-open')).toBe(true);
      expect(host.style.height).toBe('500px');
      expect(host.style.transform).toBe('translate3d(0, 24px, 0)');

      viewport.height = window.innerHeight;
      viewport.offsetTop = 0;
      listeners.get('resize')!();

      expect(host.classList.contains('is-keyboard-open')).toBe(false);
      expect(host.style.height).toBe('');
      expect(host.style.transform).toBe('');
    } finally {
      if (previousViewport) {
        Object.defineProperty(window, 'visualViewport', {
          configurable: true,
          value: previousViewport,
        });
      } else {
        delete (window as Window & { visualViewport?: VisualViewport }).visualViewport;
      }
    }
  });
});

describe('multiple instances', () => {
  it('keep independent state and unique element ids', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    document.body.append(a, b);
    cleanups.push(mountProximity(a, {}), mountProximity(b, {}));

    const ids = Array.from(document.querySelectorAll('[id]')).map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);

    // Labels still point at their (renamed) inputs.
    for (const label of document.querySelectorAll('label[for]')) {
      expect(document.getElementById(label.getAttribute('for')!)).not.toBeNull();
    }
    for (const el of document.querySelectorAll('[aria-describedby]')) {
      for (const id of el.getAttribute('aria-describedby')!.split(' ')) {
        expect(document.getElementById(id)).not.toBeNull();
      }
    }

    // Loading the sample in A must not populate B.
    a.querySelector<HTMLButtonElement>('[data-sample]')!.click();
    expect(rows(a).length).toBeGreaterThan(0);
    expect(rows(b)).toHaveLength(0);
  });
});

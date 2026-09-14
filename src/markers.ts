import L from 'leaflet';

export function popupContent(text: string): HTMLElement {
  const el = document.createElement('span');
  el.textContent = text;
  return el;
}

export function accentColor(): string {
  return (
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#007acc'
  );
}

export function personLabel(index: number): string {
  let label = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
  }
  return label;
}

export function destIcon(label?: string): L.DivIcon {
  return L.divIcon({
    className: 'px-marker',
    html: label
      ? Object.assign(document.createElement('span'), {
          className: 'px-person-badge',
          textContent: label,
        })
      : '<span class="px-marker-dot"></span>',
    iconSize: label ? [26, 26] : [18, 18],
    iconAnchor: label ? [13, 13] : [9, 9],
  });
}

export function locIcon(rank: number, selected = false): L.DivIcon {
  return L.divIcon({
    className: 'px-marker',
    html: `<span class="px-marker-num${selected ? ' is-selected' : ''}">${rank}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

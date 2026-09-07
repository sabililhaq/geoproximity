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

export function destIcon(): L.DivIcon {
	return L.divIcon({
		className: 'px-marker',
		html: '<span class="px-marker-dot"></span>',
		iconSize: [18, 18],
		iconAnchor: [9, 9],
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

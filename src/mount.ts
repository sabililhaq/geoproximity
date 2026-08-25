import 'leaflet/dist/leaflet.css';
import './styles.css';

import { invalidateProximity, startProximity } from './app';
import { proximityMarkup } from './template';

export type MountProximityOptions = {
	basePath?: string;
};

export function mountProximity(root: HTMLElement, _options: MountProximityOptions = {}): () => void {
	if (!root.querySelector('[data-proximity]')) {
		root.innerHTML = proximityMarkup;
	}

	const stop = startProximity(root);
	window.setTimeout(() => invalidateProximity(root), 60);

	return () => {
		stop();
		root.replaceChildren();
	};
}

export { invalidateProximity };

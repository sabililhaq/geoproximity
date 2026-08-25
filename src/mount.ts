import 'leaflet/dist/leaflet.css';
import './styles.css';

import { invalidateProximity, startProximity } from './app';
import { proximityMarkup } from './template';

export type MountProximityOptions = {
	basePath?: string;
	/** Load the bundled sample when the map is empty. */
	sample?: boolean;
};

export function mountProximity(root: HTMLElement, options: MountProximityOptions = {}): () => void {
	if (!root.querySelector('[data-proximity]')) {
		root.innerHTML = proximityMarkup;
	}

	const stop = startProximity(root, options);
	window.setTimeout(() => invalidateProximity(root), 60);

	return () => {
		stop();
		root.replaceChildren();
	};
}

export { invalidateProximity };

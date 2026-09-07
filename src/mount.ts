import "leaflet/dist/leaflet.css";
import "./styles.css";

import {
  invalidateProximity,
  startProximity,
  type ProximityHandle,
} from "./app";
import { proximityMarkup } from "./template";
import type { ProximityFile } from "./io";
import type { ProximityState } from "./types";

export type MountProximityOptions = {
  basePath?: string;
  /** Load the bundled sample when the map is empty. */
  sample?: boolean;
  /** Enable sharing comparisons through the URL hash. */
  share?: boolean;
  /** CARTO raster basemap key. Falls back to VITE_CARTO_API_KEY. */
  cartoApiKey?: string;
};

export type { ProximityHandle, ProximityState, ProximityFile };

export function mountProximity(
  root: HTMLElement,
  options: MountProximityOptions = {},
): ProximityHandle {
  if (!root.querySelector("[data-proximity]")) {
    root.innerHTML = proximityMarkup;
  }

  const inner = startProximity(root, options);
  window.setTimeout(() => invalidateProximity(root), 60);

  const destroy = () => {
    inner.destroy();
    root.replaceChildren();
  };
  return Object.assign(destroy, {
    destroy,
    getState: inner.getState,
    setState: inner.setState,
    onChange: inner.onChange,
  });
}

export { invalidateProximity };

import "leaflet/dist/leaflet.css";
import "./styles.css";

import {
  invalidateProximity,
  startProximity,
  type ProximityHandle,
} from "./app";
import { renderProximityMarkup } from "./template";
import type { ProximityFile } from "./io";
import type { UiLabels } from "./labels";
import type { ProximityState } from "./types";

export type MountProximityOptions = {
  basePath?: string;
  /** Load the bundled sample when the map is empty, or pass your own. */
  sample?: boolean | ProximityFile;
  /** Enable sharing comparisons through the URL hash. */
  share?: boolean;
  /** CARTO raster basemap key. Falls back to VITE_CARTO_API_KEY. */
  cartoApiKey?: string;
  /** Override visible English strings. */
  labels?: Partial<UiLabels>;
};

export type { ProximityHandle, ProximityState, ProximityFile };
export type { UiLabels };

export function mountProximity(
  root: HTMLElement,
  options: MountProximityOptions = {},
): ProximityHandle {
  if (!root.querySelector("[data-proximity]")) {
    root.innerHTML = renderProximityMarkup(options.labels);
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

# Geoproximity

Rank travel locations by distance to a destination.

Search or click a destination, add places, and sort them by great-circle distance. Distances are straight-line for now.

## Mount it

Give the host a height. Geoproximity fills that box and inherits the host font and color tokens (`--font-atkinson`, `--bg`, `--black`, `--gray`, `--gray-light`, `--gray-dark`, `--surface`, `--accent`, `--row-hover`). Invert the RGB triples for dark mode.

```ts
import { mountProximity } from 'geoproximity';

const host = document.querySelector('[data-proximity-host]');
if (host instanceof HTMLElement) {
  mountProximity(host, { basePath: '/map' });
}
```

```json
"geoproximity": "github:sabililhaq/geoproximity#v0.1.0"
```

## Develop

```sh
npm install
npm test
npm run dev
```

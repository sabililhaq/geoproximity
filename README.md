# Geoproximity

**Visualize and rank multiple locations by proximity to a destination.**

[Live demo](https://sabililhaq.com/map)

Geoproximity helps you compare locations geographically. Choose a destination, add multiple candidate locations, and see them visualized and ranked by distance.

It is designed for problems where **comparing many locations at once** is more useful than checking distances one by one.

<img width="865" height="573" alt="image" src="https://github.com/user-attachments/assets/a9be2685-c01a-4b16-a61f-573b36d6c7bb" />


## Use cases

### Choosing a travel hub

You're going to Bandung and different travel agencies have different drop-off hubs.

Instead of checking each hub individually in Google Maps, add them all to Geoproximity and immediately see which ones are closest to your destination.

### Finding a meeting point

Several people are coming from different locations and you have several candidate meeting points.

Plot the participants and candidates together to understand which options are geographically convenient.

### Choosing a restaurant

You have several restaurant options and multiple people coming from different places.

Visualize them together to compare the geographic trade-offs instead of evaluating each distance separately.

### More generally

Any problem that looks like:

> **"I have several locations. Which one makes the most sense geographically?"**

can potentially be modeled with Geoproximity.

## Why not just use Google Maps?

Google Maps is already great at answering:

> "How far is A from B?"

The problem becomes different when you have many candidates:

```text
A → B
A → C
A → D
A → E
...
```

You have to repeat the same workflow and mentally compare the results.

Geoproximity turns those individual checks into one visualization:

```text
              B
              │
              │
       C ───── A ───── D
              │
              │
              E

        ↓

     ranked by distance
```

The goal isn't to replace Google Maps. It's to make **multi-location comparison** easier.

## How it works

1. **Choose a destination** — search, click on the map, or use your current location.
2. **Add locations** — enter the places you want to compare.
3. **Visualize** — locations are plotted and connected to the destination.
4. **Rank** — candidates are sorted by proximity.

The result gives you both the **ranking** and the **geographic context** behind it.

## Runs entirely in the browser

Geoproximity performs its core geospatial calculations **client-side**.

There is no application server required to calculate or rank the locations. The browser handles the coordinates, visualization, and distance calculations.

This makes the core application:

* **Serverless** — no backend required
* **Client-side** — calculations happen locally
* **Lightweight** — the problem can be solved directly from coordinates
* **Privacy-friendly** — location data doesn't need to pass through an application server

The map and geocoding functionality may still depend on external services.

## Distance

Geoproximity supports three distance modes:

* **Straight line** — great-circle distance calculated locally from the coordinates
* **Driving** — road distance returned by the OSRM routing service
* **Walking** — walking route distance returned by the OSRM routing service

Driving and walking modes also draw the returned route geometry on the map. **Advanced settings** holds an **Animate routes** switch that flows dashes along those routes, and **Reverse direction** to run the flow from destination toward locations instead. Both are unavailable for straight-line distance and stay off when the system prefers reduced motion. Routing requests run in the browser, so they depend on the external routing service and may fall back to straight-line estimates when a route cannot be fetched.

## Limitations

The built-in location data is not yet comprehensive.

For better accuracy, you can copy a location's coordinates from Google Maps and enter them directly:

```text
latitude, longitude
```

The application also relies on external services for some functionality, so availability may occasionally be affected by external rate limits, particularly during high traffic.

The distance ranking itself only considers distance. It does not account for traffic, road conditions, population density, or other real-world factors.

## Roadmap

### Proximity

* [x] Network-based driving and walking distance
* [ ] Dijkstra-based routing
* [x] Animated connections
* [ ] Optional map-less view showing only nodes and connections
* [ ] Improve location coverage and accuracy
* [ ] Better handling and messaging around external service limits

### Sharing

* [x] Share comparisons through URL parameters without import/export

## Use as a library

Geoproximity can be embedded into another web application:

```js
import { mountProximity } from 'geoproximity';

const host = document.querySelector('[data-proximity-host]');

if (host instanceof HTMLElement) {
  mountProximity(host, { basePath: '/map', sample: true });
}
```

The host element needs a defined height. Geoproximity fills the available space and inherits the host's font and color tokens.

Pass `sample: true` to load the bundled Bandung example when the map is empty, so a first visit is a comparison instead of a blank form.

Pass `share: true` to enable sharing comparisons through a URL hash. The standalone demo enables this option; library consumers opt in explicitly.

## Development

```bash
npm install
npm test
npm run dev
```

CARTO raster tiles need an API key or the map shows an “API key required” watermark. Copy `.env.example` to `.env` and set `VITE_CARTO_API_KEY`. That file is gitignored. Restart the dev server after changing it.

When embedding the library in another Vite app, set the same variable there, or pass it explicitly:

```js
mountProximity(host, {
  cartoApiKey: import.meta.env.VITE_CARTO_API_KEY,
});
```

Vite inlines `VITE_*` values into the client bundle, and the browser sends the key on every tile request. That is how CARTO authenticates raster tiles — keep the key out of git, but do not treat it as a server secret.

---

Geoproximity started from a simple repetitive workflow:

**copy location → check Google Maps → compare → repeat.**

This project turns that workflow into a single geographic comparison.

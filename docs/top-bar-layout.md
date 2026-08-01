# Map top bar — layout rules

How the controls above the 3D map are arranged, and why it is done by
measurement rather than by CSS breakpoints.

## The clusters

Five, left to right on a single row:

1. **Icon ladder** — enlarge / obs / rotate / split (map iframe)
2. **Resort switcher** — "Whakapapa ▾" (React, `.map-resort-switch`)
3. **Mode pills** — Live / Hourly / Accum / Radar / Isobars (`#top-controls`)
4. **Model switch** — "GFS Model ▾" (`#model-switch`, hidden in Radar/Isobars)
5. **Settings cog** — (React, `.map-settings-toggle`)

Clusters 1, 3 and 4 live in `public/whakapapa-snow-forecast.html`; 2 and 5
are React, in `src/App.css`. Same origin, so the parent can measure both.

## The rules

- **One row** while every cluster clears the next by **≥4px**.
- **Two rows** when it doesn't: switcher + pills on row 1, ladder + model
  switch + cog on row 2.
- **Three rows** when the switcher and the pills cannot share a line
  (roughly below 560px): switcher, then pills, then the rest.
- **Nothing ever shrinks.** One size for every element at every width. The
  only variable is which row a cluster sits on. Below ~360px the pill group
  *wraps* — wrapping keeps every pill full-size and present, which is what
  shrinking and scrolling each fail to do.

Row tops are 20 / 66 / 112 — 38px tall each, 8px gutter.

## How it works

`syncTopBarRows()` in `src/App.jsx` (inside `ForecastMap3D`) measures all
five clusters, picks the row count, and stamps `rows-1` / `rows-2` /
`rows-3` onto both `.map-region` and the iframe's `<html>`. One decision,
both documents. It also sets two custom properties the CSS reads:

- `--tc-right` — how much room the pills must leave on their right, measured
  off where `#model-switch` actually sits (`right: 68px`) or off the cog
  (`right: 20px`, 38px wide) when the model switch is hidden.
- `--switcher-left` — on one row the switcher follows the icon ladder; once
  stacked it takes the 20px corner.

The old `@media` rules are still there as the pre-script fallback for first
paint. The `rows-*` state rules beat them on specificity — element+class
outranks a bare id inside a media query, and media queries add no
specificity of their own.

## Why not breakpoints

Every band that was tried here failed for the same reason: a `@media` rule
cannot know how wide "The Remarkables" renders, or that Radar hides the
model switch and frees 121px. They were guesses at numbers only the browser
has.

## Traps this has already fallen into

- **`overflow-x: auto` on `#mode-switch`.** When the row ran short the pills
  were silently *clipped* — Isobars, sometimes Radar, gone with nothing to
  say they existed. Never restore this. A layout that looks wrong gets
  reported; a mode that vanished cannot be.
- **`.main-content` has no containing block.** Anything absolutely
  positioned in the map overlay resolved against the viewport, so `left:
  20px` counted the sidebar in and put the switcher on top of the nav.
  `.map-region { position: relative }` fixes it and must stay.
- **The switcher's default rule anchors its RIGHT edge 8px left of the
  centreline.** Its position then depends on the viewport rather than on
  what sits beside it — that is what walked it into the icon ladder at
  960px and under the pills at 1200px. Every cluster should be anchored to
  an edge, never to the middle.
- **Measuring the rendered box instead of `scrollWidth`.** A clipped pill
  group reports a width that "fits". This is the check whose absence let a
  regression reach production; `scripts/layout-probe.mjs` now asserts it.

## Verifying

    npm run build && npx vite preview --port 5199 &
    node scripts/layout-probe.mjs

Expect ✅ at every width. Run it after any change to the top bar in either
file. On a local machine (not the sandboxed cloud runner, where MapLibre's
CDN is blocked) `npm run browser-check /map/whakapapa --headed` will also
show the map itself rendering.

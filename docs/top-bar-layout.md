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
  only variable is which row a cluster sits on, and how much air is left
  around them: the side inset flexes from 20px down to 10px before anything
  is allowed to wrap (`--row-inset`). At 375px the pill group is 337px wide
  against 335px of room, and those few pixels of padding are the difference
  between one line and "Isobars" sitting on a line of its own.
- **Below ~350px the pill group wraps**, because no amount of padding will
  save it. Wrapping keeps every pill full-size and present, which is what
  shrinking and scrolling each fail to do — and the wrapped line is a full
  38px line: the group grows, and row three moves down with it.

Row tops are 20 / 66 / `--row3-top` (112 unless row two wrapped) — 38px tall
each, 8px gutter. Everything anchored under the bar follows: the settings
cog, the model switch, the icon ladder, and MapLibre's own zoom control.

## How it works

`syncTopBarRows()` in `src/App.jsx` (inside `ForecastMap3D`) measures all
five clusters, picks the row count, and stamps `rows-1` / `rows-2` /
`rows-3` onto both `.map-region` and the iframe's `<html>`. One decision,
both documents. It also sets two custom properties the CSS reads:

- `--tc-right` — how much room the pills must leave on their right, measured
  off where `#model-switch` actually sits (`right: 68px`) or off the cog
  (`right: 20px`, 38px wide) when the model switch is hidden.
- `--switcher-left` — on one row the switcher follows the icon ladder; once
  stacked it takes the corner. The switcher is pinned to the row's own top
  (`top: 20px`), not centred on its container: that container is 78px tall on
  a desktop and 28px on a phone, so centring drew the pill 5px above the top
  of the map with its top edge cut off.
- `--row-inset` — the side inset for the stacked rows, 20px down to 10px.
- `--row3-top` — where row three starts, which is not a constant once row two
  can be two lines tall.

The old `@media` rules are still there as the pre-script fallback for first
paint. The `rows-*` state rules beat them on specificity — element+class
outranks a bare id inside a media query, and media queries add no
specificity of their own.

Three details make the measurement trustworthy:

- **It measures in a neutral state.** The pass adds `tb-measuring` to the
  iframe's `<html>` for its duration, which un-wraps the pill group and drops
  its width cap, then removes it. Without that it was reading whatever size
  the CURRENT plan had given the pills — and a `rows-3` group is allowed to
  wrap onto two lines, so it measured about half its real width and argued
  itself back onto a row it did not fit.
- **It measures `#top-controls`, not `#mode-switch`.** Accum mode puts the
  5/10/15 period group in that same container; measuring only the mode pills
  left ~120px out of every sum and drove the pills through the switcher.
- **It measures where the switcher actually lands.** `--switcher-left`
  positions the switcher's wrapper; the button inside sits a further ~12px
  right. The offset is read from the DOM each pass rather than assumed to be
  zero.

The iframe re-measures nothing itself. Its own `syncTopControlsLayout()` —
the fallback for when this page is opened outside the dashboard — stands
down whenever it is in a frame, because its inline `max-width` (measured
without any knowledge of the switcher or the cog) beat the row rules and
squeezed the pills until Accum, Radar and Isobars spilled out of the group.
What it does do is *tell* the parent when something changed: any width-
affecting change in the toolbar posts `{ type: 'top-bar-changed' }` up, and
the parent re-measures on that rather than up to a second later on its poll.

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
- **Measuring the pills in whatever state the current plan left them.** A
  wrapped (`rows-3`) group's `scrollWidth` is about half its natural width,
  which is enough to flip the layout back and forth around 520px. Hence the
  `tb-measuring` pass.
- **The iframe's own fallback fighting the parent.** Two layout systems on
  one row, and the inline one wins on specificity whatever the stylesheet
  says. Only one of them may be in charge at a time.
- **Non-monotonic widths are not a bug.** The nav rail widens from 64px to
  220px around 940px, so the map region is genuinely *narrower* at 940 than
  at 900 and the row count can go up as the window gets wider. Measure the
  region, never the viewport.
- **`scrollWidth` stops at the padding box.** It reported the pill group 8px
  narrower than it draws (its border, and the group's own padding), which was
  enough to leave the row a few pixels short and wrap a pill. Measure the
  outer box for widths; keep `scrollWidth` only for the "is it clipped" test.
- **A hard `height` on `.pill-group` for every row state.** It came after the
  `rows-3` wrap rule at equal specificity and won, so a wrapped group stayed
  one pill tall and drew its second line outside its own grey pill.
- **A fixed delay in the probe.** The map page keeps changing cluster widths
  as it loads (saved view mode restored, model label filled in, Radar's pill
  dropped outside NZ), so a fixed wait sometimes sampled mid-change and
  reported an overlap that was gone a tick later. It now waits for two
  identical reads before asserting.

## Verifying

    npm run build && npx vite preview --port 5199 &
    node scripts/layout-probe.mjs

Expect ✅ at every width. Run it after any change to the top bar in either
file, and run it for more than the default path — the clusters differ by
view mode and by resort name length:

    node scripts/layout-probe.mjs --path=/map/whakapapa/accumulated  # + period pills
    node scripts/layout-probe.mjs --path=/map/whakapapa/radar        # no model switch
    node scripts/layout-probe.mjs --path=/map/the-remarkables        # longest name

The public edition is worth a pass of its own too, since it drops the Live
pill: `VITE_APP_EDITION=public npm run build` before the probe. On a local machine (not the sandboxed cloud runner, where MapLibre's
CDN is blocked) `npm run browser-check /map/whakapapa --headed` will also
show the map itself rendering.

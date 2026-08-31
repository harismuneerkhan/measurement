# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

BodyMeasure is a browser-based body & face measurement app. It uses the device camera (or an uploaded photo) with MediaPipe Face Mesh and Pose models to detect landmarks, converts pixel distances to real-world millimetres via a user-driven calibration step, and renders the results as an overlay + table. Everything runs client-side — no server, no image upload (see the footer disclaimer in `index.html`).

## Commands

- `npm run dev` — start Vite dev server (opens on port 3000, see `vite.config.js`)
- `npm run build` — production build to `dist/`
- `npm run preview` — preview the production build

There is no test suite, linter, or type checker configured in this project.

## Architecture

Plain JS + Vite, no framework. Entry point is `index.html` → `src/main.js`.

- **MediaPipe is not an npm dependency** — `main.js` dynamically injects `<script>` tags loading `FaceMesh` and `Pose` from the `cdn.jsdelivr.net/npm/@mediapipe` CDN at specific pinned versions (`loadMediaPipe()`), rather than being bundled by Vite. This avoids Vite having to handle MediaPipe's WASM assets.
- **Pipeline**: camera/upload frame → `faceMesh.send()` / `pose.send()` → results land in module-level `faceLandmarks`/`poseLandmarks` in `main.js` (via `onResults` callbacks) → `drawFrame()` computes measurements and renders. The pose model's `onResults` callback is what triggers `drawFrame()` for each tick, so it always fires after both models have responded for that frame.
- **`src/utils/calibration.js`** (`Calibration` class): all pixel→mm conversion goes through this. The user calibrates by picking a reference object (credit card / A4 / custom width) and manually entering how many pixels wide it appeared (via a `prompt()` — there's no automatic reference-object detection). `pxPerMm` is the single derived scale factor; nothing computes real-world size without it (`isCalibrated()` gates all measurement output).
- **`src/utils/measurements.js`** (`computeMeasurements`): pure function mapping face/pose landmarks + `Calibration` + the enabled-measurement `Set` → an array of `{key, label, valueMm, display, range}`. Landmark indices for Face Mesh (e.g. 234/454 cheekbones, 468/473 refined pupils, 10/152 forehead/chin) and Pose (11/12 shoulders, 13/15 elbow/wrist) are documented in the file header comment — cross-reference there before changing any measurement's landmark pair. Head circumference uses a Ramanujan ellipse-perimeter approximation scaled by 1.15 for head depth; neck width is estimated as 0.76× shoulder width (no direct neck landmarks exist in Pose).
- **`src/utils/renderer.js`** (`render`): draws the video/image frame, face dots, pose skeleton (`POSE_CONNECTIONS` edge list), and measurement overlay lines/labels. The `lineFor` map in `drawMeasurementOverlay` must stay in sync with the landmark pairs used in `measurements.js` for each measurement key, since it independently re-derives which landmarks to draw a line between (head circumference is handled separately as an ellipse rather than a line).
- **Enabled measurements** are driven by checkboxes in `index.html` (`[data-measure]`), synced into a `Set` in `main.js`; both `computeMeasurements` and the renderer only act on measurement keys present in that set.
- State (calibration, landmarks, mode) lives in module-level variables in `main.js` — there is no state management library or framework reactivity.

## Adding or changing a measurement

A measurement key is spread across four places; all of them must agree or the feature half-works silently:

1. `index.html` — a `<label><input type="checkbox" data-measure="<key>">` in `.checkboxes`
2. `src/utils/measurements.js` — an entry in both `LABELS` and `TYPICAL_RANGES`, plus the `enabled.has('<key>')` block that pushes the result
3. `src/utils/renderer.js` — an entry in the `lineFor` map inside `drawMeasurementOverlay` (2 landmarks = straight line, 3+ = polyline; anything non-linear like `headCircumference` needs a special case)
4. Face measurements only run when `faceLandmarks` is present and pose measurements only when `poseLandmarks` is — put the block under the right branch

Missing the `lineFor` entry produces a row in the results table with no overlay; missing the `LABELS`/`TYPICAL_RANGES` entry produces `undefined` in the table.

## Gotchas

- **Requires network access even in dev.** MediaPipe comes from the jsdelivr CDN at runtime, so `npm run dev` offline gives you a camera feed with no landmarks. The pinned versions live in `FM_VER`/`PO_VER` inside `loadMediaPipe()` in `main.js` and must match the `locateFile` paths (the model's WASM/data files are fetched from the same versioned CDN directory).
- **Camera mode and upload mode drive rendering differently.** Camera mode runs a `requestAnimationFrame` loop (`tick()`) that awaits `faceMesh.send()` then `pose.send()` each frame; upload mode has no loop — the `detectBtn` handler sends a single frame. Either way `drawFrame()` is only ever called from `pose.onResults`.
- **Calibration is in-memory only** — no persistence, so a page reload drops `pxPerMm` and all measurements disappear until the user recalibrates.
- **CSV export scrapes the DOM table**, not the `measures` array, so it exports whatever the table currently shows (including the placeholder row when there are no results).
- `npm install` pulls only Vite; there are no runtime dependencies.

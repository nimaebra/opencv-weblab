# Changelog

## Unreleased

- Refine workspace controls and transitions, with reduced-motion support and visible graph node borders in forced colors.
- Clarify preview and comparison feedback, including when a pinned node needs its source reconnected after a PNG export fails.
- Add Template matching, Inpaint, Flood selection, Pad image and Fourier spectrum, bringing the catalog to 52 tools.
- Add a guided template matching experiment, bringing the example library to 19.
- Add CLAHE, Crop / ROI, Perspective correction, Hough lines and circles, Top-hat, Black-hat, Shi–Tomasi corners, Distance transform and Color map.
- Add matching Python exports, geometry dimension checks, bounded worker allocations and deterministic annotated detector outputs.
- Add five guided experiments and three synthetic fixtures available offline (ten fixtures total).

- Name the app OpenCV WebLab across the interface, PWA, exports, packages and documentation.
- Publish to GitHub Pages after validation on pushes to `main` and published releases.
- Run CI in Chromium, Firefox and WebKit, and attach static-site downloads to releases.
- Preserve existing local experiments and accept the previous portable-backup format.

## 0.2.0 — 2026-10-28

- Adopt Apache-2.0 and document the educational purpose and contribution workflow.
- Replace optional accounts and cloud services with a static client-only application.
- Preserve existing local projects while removing obsolete cloud settings.
- Add searchable local projects, immutable image replacement and portable backups.
- Add offline caching and a save-before-update flow.
- Improve viewer zoom, comparison pins, pixel inspection and histograms.
- Add atomic graph insertion, selection actions, connection controls and automatic layout.
- Add channel extraction, HSV masks, equalization, normalization, sharpening, morphological gradient, absolute difference and XOR.
- Expand the example library to six guided experiments and retain Python/JSON/PNG exports.

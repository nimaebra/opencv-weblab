# Roadmap

## v0.2 — local learning lab

- Static client-only app with local projects and portable image-inclusive backups.
- Offline reopening and controlled updates.
- Pixel inspection, histograms, true-size zoom and stable comparison pins.
- Atomic graph editing and 33 processing tools.
- Six teaching examples, Python export and contributor documentation.

## Object-analysis extension

Implemented: Connected components, Contour analysis, Filter objects by area and Apply mask. Preview tables, bounding-box inspection, explicit full-resolution measurement/CSV, equivalent Python exports and three synthetic guided experiments complete the segment → filter → measure → isolate workflow. Processing remains local and offline.

## Image-tool extension

Implemented: CLAHE, Crop / ROI, Perspective correction, Hough line segments, Hough circles, Top-hat, Black-hat, Shi–Tomasi corners, Distance transform and Color map. The library now has 47 processing tools and 18 guided experiments with ten synthetic fixtures. Numeric geometry controls, annotated detection images and equivalent Python exports stay local and offline. Geometry tools update dimension inference and are excluded from three-value comparisons.

## Next: publish and listen

The learning extension now adds grayscale neighborhood/kernel explanations for Box blur, Gaussian blur and Sharpen; four synthetic teaching fixtures; ten optional guided experiments with local progress; and bounded three-value parameter comparisons. Median sorting and morphology calculations remain future explainer work.

Create the public repository, enable private vulnerability reporting, deploy a static demonstration, and invite classroom and beginner feedback. Use that feedback to prioritize onboarding and explanations before increasing the tool count.

## Possible learning improvements

- Extend pixel explanations to median sorting and morphology’s active neighborhoods.
- Validate the guided activities and synthetic fixtures with beginner learners.
- Saved experiment observations, inspectable regions and reusable graph recipes.
- On-image crop and perspective handles alongside numeric controls.
- Optional line, circle and corner measurement tables and CSV export.
- Better experiment comparison and performance on lower-memory devices.

Camera/video, collaboration, AI assistance and industrial integrations have no committed timeline. A feature belongs here when it helps someone understand image processing and can remain useful without a backend.

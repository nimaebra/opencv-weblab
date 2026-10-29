# Object and shape analysis

Start with **When pixels belong together**, **Two meanings of area**, or **Keep the useful objects** in the example selector. The deterministic fixtures ship with the offline app. All four new tools run inside the existing pinned OpenCV 4.13 worker.

## Segment, filter, measure, isolate

1. Build a grayscale foreground mask using thresholding or an HSV range mask. Zero means background; every nonzero intensity means foreground. No hidden threshold is applied by the analysis tools.
2. Use **Filter objects by area** to remove complete connected regions outside an inclusive pixel-area range. Its default minimum is 25 and maximum is 16,777,216. Preview thresholds scale by the square of the preview scale.
3. Use **Connected components** to count and measure foreground regions, or **Contour analysis** to measure their outer boundaries.
4. Connect the original image to **Apply mask** input A, and the cleaned grayscale mask to input B. Dimensions must match. Nonzero mask pixels copy the original values, including alpha; excluded RGBA pixels become transparent black. Grayscale output becomes black outside the mask. Mask intensity is inclusion, not a proportional opacity.

## What the numbers mean

| Measurement  | Definition                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Pixel area   | Number of foreground pixels belonging to a connected component.                                                             |
| Contour area | Area of the outer polygon returned by external contour retrieval; enclosed holes contribute to this outer silhouette area.  |
| Perimeter    | Closed outer contour arc length.                                                                                            |
| Centroid     | Mean foreground-pixel coordinate for components; area-moment centroid for contours. Lines and points have no area centroid. |
| Bounding box | Top-left x/y and width/height, using an origin at the image’s top-left.                                                     |

A filled 7×7 square has pixel area 49, contour area 36 and perimeter 24. Four-connectivity joins shared sides; eight-connectivity also joins shared corners. Touching foreground regions can therefore count as one object. External contours omit interior hole contours. These are measurements of segmentation and geometry, not recognition of real-world object types.

Component IDs follow the first foreground pixel in raster order; contour IDs follow the earliest boundary point in raster order. IDs and visualization colors are deterministic for an unchanged input, but can change after edits or between preview and full-resolution detection.

## Inspect and export

Open **Measurements** below output B. Tables show at most 50 rows per page; focus or select an ID to highlight its bounding box. Pan and zoom use the same coordinate mapping as the image. Tables scroll horizontally on narrow screens.

Preview measurements use displayed preview pixels and pixels squared. Downsampling can remove or connect regions, so counts and areas cannot be recovered by merely scaling these values. Choose **Measure full resolution / CSV** to recompute only the selected step’s dependencies from original images. The dialog pairs full-resolution rows with their matching image. Fit, 100%, zoom buttons and keyboard panning support inspection. CSV retains numeric precision; the table rounds fractional display values to two decimals. Close the dialog to release its image. Processing edits, image replacement, export and engine restart invalidate full results.

Generated Python reproduces all four tools, spatial IDs and label colors, and writes a `measurements_<step>.csv` for each enabled analysis step. CSV columns include area, centroid, bounds and evaluated image dimensions; contour CSV additionally includes perimeter. Empty results retain a header. A degenerate centroid exports empty fields. Portable backups contain the graph and originals; measurements are recomputed after reopening.

## Bounds

Analysis supports at most 10,000 objects and checks temporary memory before synchronous OpenCV calls. The existing graph working budget is 256 MiB and preview cache budget is 128 MiB. Full-resolution analysis can reject images below the import limit when label or contour scratch buffers do not fit. Reduce image size, noise or branching when the tool reports that limit. Cancellation happens between synchronous OpenCV calls. There are no model downloads, accounts, image uploads or new runtime dependencies.

## Why these tools

The release follows established [ImageJ particle-analysis workflows](https://imagej.net/imaging/particle-analysis), [scikit-image region measurements](https://scikit-image.org/docs/stable/auto_examples/segmentation/plot_regionprops.html), and [OpenCV contour analysis](https://docs.opencv.org/4.13.0/d5/daa/tutorial_js_contours_begin.html). Their recurrence supports their relevance; it is not a measured usage ranking. The [OpenCV shape-analysis reference](https://docs.opencv.org/4.13.0/d3/dc0/group__imgproc__shape.html) documents the distinction between contour area and occupied pixels.

# Validation and deployment checks

OpenCV WebLab was checked locally on 2026-10-29. Every deployment also requires the [CI and Deploy workflow](https://github.com/nimaebra/opencv-weblab/actions/workflows/ci.yml) to pass on the published commit.

| Check                                                    | Local result / deployment requirement                                                          |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| ESLint, workspace TypeScript checks and production build | Passed locally; required in CI                                                                 |
| Unit, graph, storage, backup and real-WASM tests         | 129 passed; required in CI                                                                     |
| Generated Python against native OpenCV 4.13              | All 37 processing operations and measurement CSVs passed; required in CI                       |
| Chromium acceptance                                      | 40 scenarios passed on macOS; full suite required on Linux in CI                               |
| WebKit acceptance                                        | 40 scenarios passed on macOS; full suite required on Linux in CI                               |
| Firefox acceptance                                       | Full 40-scenario suite required on Linux in CI; native macOS launch limitation described below |
| React Doctor, changed-source scan                        | No issues reported in changed files                                                            |
| Formatting                                               | Passed; required in CI                                                                         |
| Desktop and narrow-screen visual review                  | Completed; public screenshots in `docs/images/`                                                |

The 80 current Chromium/WebKit browser scenarios cover migrations from populated IndexedDB v1, original-image preservation, portable backups, project management, real drag/drop insertion, multiselection, atomic undo, viewport restoration, storage denial/quota failures, pixel inspection, and worker memory/export behavior. Production checks cover offline reopening at both `/` and `/lab/`, pending-edit persistence before updates, and backup recovery when an update cannot save. Pointer inspection is checked through zoom, pan and resize with device pixel ratio 2.

Learning coverage includes saved prediction/reflection notes and learner-confirmed progress, actual WASM pixel arithmetic and mirrored borders, rapid keyboard inspection, three real comparison outputs, valid settings, undoable application, cancellation, preview bounds and offline fixtures. The earlier learning baseline also includes keyboard arrival from the Inspector on desktop and mobile. These learning scenarios remain part of the current Chromium/WebKit suite.

The local macOS Firefox binary cannot open its temporary profile and fails before the app loads. CI installs the matching Playwright browser on Ubuntu 24.04 and runs the complete Firefox suite there. Browser failures block publishing; traces and per-browser performance reports are uploaded as workflow artifacts.

The reference Chromium worker run on Apple M4 Pro measured **46.2 ms p95** for a warmed 1,024-pixel grayscale → Gaussian → Canny chain (20 samples) and **12.8 ms p95** for incremental edits (200 samples). The matrix cache stayed below its 128 MiB bound and original-resolution export produced the expected 2,048-pixel result. These measurements describe this machine and browser run; they are not a performance guarantee.

Object-analysis coverage verifies 4/8 connectivity, pixel versus contour area, inclusive and scaled area filtering, empty masks, degenerate contours, deterministic IDs, heterogeneous mask inputs, alpha clearing, object/memory bounds and portable recipes. A storage regression checks that all seven synthetic fixtures keep distinct asset identities when switching experiments. Browser checks cover table pagination, bounding-box alignment through zoom/pan/resize, cached measurement metadata, superseded/canceled full requests, independent target evaluation, repeated full calculations, CSV downloads and offline original-resolution measurements at both base paths. Full-result frame ownership and stale-reply cleanup have a unit regression test. Desktop and mobile evidence is stored in `.impeccable/review/object-analysis-desktop.png` and `object-analysis-mobile.png`.

The pixel explainer is intentionally limited to grayscale Box blur, Gaussian blur and Sharpen with an effective preview kernel up to 7×7. Tests compare modeled contributions with the pinned OpenCV runtime, including rounding, clipping, scaled kernels and very small images. Other operations remain available without implying they use a weighted sum. No student learning study has been conducted; use the [learner-session guide](learning-validation.md) before claiming educational effectiveness.

Generated traces, parity details and performance reports remain ignored build/test artifacts. Reproduce the checks using the commands in the root README. The [public repository](https://github.com/nimaebra/opencv-weblab) and [GitHub Pages demonstration](https://nimaebra.github.io/opencv-weblab/) use the pipeline described in the [deployment guide](deployment.md).

## Performance benchmarks

Worker dimensions, cancellation, exports, cache bounds and matrix counts remain required correctness checks in every browser. Absolute latency depends on the machine and browser, so CI records `tests/reports/performance-<browser>.json` instead of enforcing a universal millisecond threshold on shared runners. The reports include CPU model, date, sample counts and incremental/full-pipeline p95 measurements.

To enforce a latency budget on a controlled machine, set an explicit positive threshold:

```sh
OPENCV_WEBLAB_PERFORMANCE_BUDGET_MS=150 pnpm test:e2e --project=chromium tests/e2e/worker.spec.ts
```

A missed configured budget fails the worker scenario and leaves its measurement report available for diagnosis.

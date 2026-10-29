# Release validation

Validated on 2026-10-29 for the v0.2 local learning lab and its learning and object-analysis extensions.

| Check                                                    | Result                                                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| ESLint, workspace TypeScript checks and production build | Passed                                                                                   |
| Unit, graph, storage, backup and real-WASM tests         | 128 passed                                                                               |
| Generated Python against native OpenCV 4.13              | All 37 processing operations and measurement CSVs passed                                 |
| Chromium acceptance                                      | 34 scenarios verified on macOS                                                           |
| WebKit acceptance                                        | 34 scenarios verified on macOS                                                           |
| Firefox acceptance                                       | Current additions blocked before app load; previous 30-scenario baseline passed in Linux |
| React Doctor, full source scan                           | Score 84/100; one pre-existing sequential image-loading advisory                         |
| Formatting and local documentation links                 | Passed                                                                                   |
| Desktop and narrow-screen visual review                  | Completed; learning evidence in `.impeccable/review` (local, ignored)                    |

The 68 current Chromium/WebKit browser scenarios cover migrations from populated IndexedDB v1, original-image preservation, portable backups, project management, real drag/drop insertion, multiselection, atomic undo, viewport restoration, storage denial/quota failures, pixel inspection, and worker memory/export behavior. Production checks cover offline reopening at both `/` and `/lab/`, pending-edit persistence before updates, and backup recovery when an update cannot save. Pointer inspection is checked through zoom, pan and resize with device pixel ratio 2.

Learning coverage includes saved prediction/reflection notes and learner-confirmed progress, actual WASM pixel arithmetic and mirrored borders, rapid keyboard inspection, three real comparison outputs, valid settings, undoable application, cancellation, preview bounds and offline fixtures. The earlier learning baseline also includes keyboard arrival from the Inspector on desktop and mobile. These learning scenarios remain part of the current Chromium/WebKit suite.

The fresh macOS Firefox binary failed before loading the app because it could not open its temporary profile. The Docker engine did not answer the Linux fallback inventory request within 15 seconds. Firefox validation of the new object-analysis extension therefore remains outstanding. The earlier 30-scenario learning baseline passed in the official Linux image; that earlier evidence does not validate these new additions. Chromium and WebKit ran natively on macOS.

The reference Chromium worker run on Apple M4 Pro measured **46.2 ms p95** for a warmed 1,024-pixel grayscale → Gaussian → Canny chain (20 samples) and **12.8 ms p95** for incremental edits (200 samples). The matrix cache stayed below its 128 MiB bound and original-resolution export produced the expected 2,048-pixel result. These measurements describe this machine and browser run; they are not a performance guarantee.

Object-analysis coverage verifies 4/8 connectivity, pixel versus contour area, inclusive and scaled area filtering, empty masks, degenerate contours, deterministic IDs, heterogeneous mask inputs, alpha clearing, object/memory bounds and portable recipes. A storage regression checks that all seven synthetic fixtures keep distinct asset identities when switching experiments. Browser checks cover table pagination, bounding-box alignment through zoom/pan/resize, cached measurement metadata, superseded/canceled full requests, independent target evaluation, repeated full calculations, CSV downloads and offline original-resolution measurements at both base paths. Full-result frame ownership and stale-reply cleanup have a unit regression test. Desktop and mobile evidence is stored in `.impeccable/review/object-analysis-desktop.png` and `object-analysis-mobile.png`.

The pixel explainer is intentionally limited to grayscale Box blur, Gaussian blur and Sharpen with an effective preview kernel up to 7×7. Tests compare modeled contributions with the pinned OpenCV runtime, including rounding, clipping, scaled kernels and very small images. Other operations remain available without implying they use a weighted sum. No student learning study has been conducted; use the [learner-session guide](learning-validation.md) before claiming educational effectiveness.

Generated traces, parity details and performance reports remain ignored build/test artifacts. Reproduce the checks using the commands in the root README. No public repository, release or deployed demonstration was created during this implementation.

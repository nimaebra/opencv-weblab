# Release validation

Validated on 2026-10-28 for the v0.2 local learning lab.

| Check                                                    | Result                                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------------- |
| ESLint, workspace TypeScript checks and production build | Passed                                                                     |
| Unit, graph, storage, backup and real-WASM tests         | 95 passed                                                                  |
| Generated Python against native OpenCV 4.13              | All 33 processing operations passed                                        |
| Chromium acceptance                                      | 24 scenarios verified on macOS                                             |
| WebKit acceptance                                        | 24 scenarios verified on macOS                                             |
| Firefox acceptance                                       | 24 scenarios verified in the official Playwright 1.64.1 Ubuntu Noble image |
| React Doctor, including new staged components            | No findings reported; service score 84/100                                 |
| Formatting and local documentation links                 | Passed                                                                     |
| Desktop and narrow-screen visual review                  | Completed; screenshots in `docs/images`                                    |

The 72 browser checks cover migrations from populated IndexedDB v1, original-image preservation, portable backups, project management, real drag/drop insertion, multiselection, atomic undo, viewport restoration, storage denial/quota failures, pixel inspection, and worker memory/export behavior. Production checks cover offline reopening at both `/` and `/lab/`, pending-edit persistence before updates, and backup recovery when an update cannot save. Pointer inspection is checked through zoom, pan and resize with device pixel ratio 2. The corrected high-DPI scenario was rerun separately in each engine after updating its coordinates for the inspection panel's layout change.

The local macOS Firefox binary failed before loading the app because it could not open its temporary profile. Firefox coverage therefore ran in the locally cached official Linux image, using an isolated source copy and no database/storage services. Chromium and WebKit ran natively on macOS.

The reference Chromium worker run on Apple M4 Pro measured approximately **42 ms p95** for a warmed 1,024-pixel grayscale → Gaussian → Canny chain and **14 ms p95** for incremental edits over 200 samples. The matrix cache stayed below its 128 MiB bound and original-resolution export produced the expected 2,048-pixel result. These measurements describe this machine and browser run; they are not a performance guarantee.

Generated traces, parity details and performance reports remain ignored build/test artifacts. Reproduce the checks using the commands in the root README. No public repository, release or deployed demonstration was created during this implementation.

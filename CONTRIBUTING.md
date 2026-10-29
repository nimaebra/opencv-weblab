# Contributing to OpenCV WebLab

OpenCV WebLab helps people understand OpenCV through visible, reproducible experiments. Contributions should improve that learning experience while keeping the app usable without accounts, server APIs or external services.

## Development

Use Node.js 24 and pnpm 11.28.9. Run `pnpm install --frozen-lockfile`, then `pnpm dev`. Open http://localhost:5173. The bundled OpenCV runtime avoids a separate download. Do not commit `node_modules`, build output, local data, generated test reports or secrets.

Before submitting changes, run `pnpm format:check` and `pnpm check`. Run relevant Playwright scenarios for UI, worker, persistence or offline behavior; install browsers with `pnpm exec playwright install chromium firefox webkit`. Python parity uses a separate environment: install `tests/requirements.txt`, then run `OPENCV_WEBLAB_PYTHON=/path/to/python pnpm test:parity`.

Production/offline tests build the app and serve it on a separate local port. Service workers are disabled in development, so use a production preview to reproduce caching issues.

## Adding an image operation

1. Add a stable identifier and version to the operation registry in `packages/pipeline`. Define defaults, numeric bounds, input/output modes, parameter explanations, a suggested experiment and a relevant OpenCV documentation URL. Never reuse an existing identifier for different semantics.
2. Implement the OpenCV adapter in `packages/engine`. Return a new 8-bit RGBA or grayscale matrix, keep input matrices immutable, and delete every temporary allocation in `finally`. Explain alpha behavior; avoid hidden input conversions unless the tool explicitly teaches that conversion.
3. Add matching Python generation, including helper functions where needed. Keep channel ordering, normalization, clipping, borders and alpha behavior consistent.
4. Add controlled-pixel tests, invalid-mode/parameter cases, and native Python parity coverage. Use nontrivial parameters and distinct merge inputs. Add a teaching example when the new concept warrants it.
5. Verify preview scaling, original-resolution export, memory cleanup, keyboard controls and documentation. Tool counts and controls derive from registry metadata.

See [ARCHITECTURE.md](ARCHITECTURE.md) for data boundaries and document compatibility.

## UI and storage changes

Preserve the preview-first layout and visual language in `DESIGN.md`. Include desktop and narrow-screen behavior, visible focus, readable labels, loading/error/empty states and alternatives to dragging. Graph edits must be atomic and undoable. Do not store image buffers in React state.

Existing schema-version-1 JSON and IndexedDB projects must remain readable. Test migrations against populated old databases. Never modify an image blob under an existing identifier, collect assets still referenced by a project/history, or report a successful save after a storage error. Test both denied storage and quota exhaustion.

## Issues and pull requests

Use the bug or feature form. Explain the learner's problem, expected behavior and a small reproduction. For bugs, include browser/OS versions and a sample pipeline or nonprivate image. Avoid adding a large dependency or expanding the image model without discussing the design first.

Keep pull requests focused. Describe the behavior change, compatibility implications and checks actually run. Conventional commit prefixes (`feat`, `fix`, `docs`, `test`, `chore`) are welcome. Contributors retain copyright; contributions are accepted under Apache-2.0, the same license as the project. No contributor license agreement is required.

Follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report sensitive vulnerabilities through the process in [SECURITY.md](SECURITY.md), rather than a public reproduction.

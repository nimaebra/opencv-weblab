# Roveran

An interactive OpenCV learning lab. Connect image operations, change their parameters, and inspect each result immediately. All pixel processing runs locally in a dedicated WebAssembly worker.

![Roveran editor](.impeccable/review/desktop.png)

## Start the lab

Requires Node.js 24 and pnpm 11.28.9. The repository includes the pinned OpenCV 4.13.0 runtime and sample images, so guest editing needs no API credentials, database, or runtime CDN.

```sh
pnpm install
pnpm dev
```

Open **http://localhost:5173**. Vite serves the editor and proxies `/api` to Fastify on port 3001. The initial edge-detection experiment is ready to edit. Select a node to see its parameters; drag or click a tool to add it. Use the Inspector's input selector as a keyboard alternative to dragging connections. `/` focuses tool search; Ctrl/Command-Z undoes and Ctrl/Command-Shift-Z redoes.

The image comparison supports synchronized pan/zoom, pinned A/B outputs, and a wipe when dimensions match. JSON preserves graph structure and source references; reconnect missing files after importing. Python export produces a complete script with explicit OpenCV color conversions and input filename placeholders. PNG export evaluates the selected B output at original resolution.

## Accounts and cloud saving

Guest projects and original files autosave to IndexedDB. Cloud accounts are optional.

```sh
cp .env.example .env
# Set BETTER_AUTH_SECRET in .env (generate with: openssl rand -base64 32)
docker compose up -d
pnpm db:migrate
pnpm dev
```

PostgreSQL uses host port **54329** to avoid interfering with an existing local database. RustFS provides S3-compatible local storage on **9000** and its console on **9001**. These services bind to loopback. Development credentials are in `.env.example`.

Configure Google and/or GitHub OAuth client credentials in `.env`. Register callback URLs:

- `http://localhost:5173/api/auth/callback/google`
- `http://localhost:5173/api/auth/callback/github`

For production, use the deployed HTTPS origin in `APP_ORIGIN` and OAuth callbacks, a high-entropy secret, your PostgreSQL URL, and credentials for a private S3-compatible bucket. Set `S3_CREATE_BUCKET=false` when bucket creation is managed separately. A provider button appears enabled only when configured.

A cloud save uploads the graph. **Include original images** explicitly opts that project into image uploads. Subsequent edits autosave; unchanged images are not uploaded again. Turning inclusion off removes that project's cloud image copies. Image processing and derived previews remain local. Cloud revision conflicts preserve local edits and offer **Save as a new copy**. Cloud bindings and their last acknowledged revisions also survive reloads.

## Workspace structure

| Workspace           | Responsibility                                                                     |
| ------------------- | ---------------------------------------------------------------------------------- |
| `apps/web`          | React/Vite editor, React Flow graph, Zustand state, local storage, cloud client    |
| `apps/api`          | Fastify routes, Better Auth, Drizzle schema/migrations, private S3 storage         |
| `packages/pipeline` | Versioned document schemas, operation registry, graph validation, Python generator |
| `packages/engine`   | OpenCV adapters, worker protocol, dependency evaluator, caches and cancellation    |
| `packages/ui`       | Radix dialog/slider primitives and shared controls                                 |
| `packages/config`   | Shared strict TypeScript configuration                                             |

See [ARCHITECTURE.md](ARCHITECTURE.md) for execution, schema, persistence and extension details. [PRODUCT.md](PRODUCT.md) records the confirmed product requirements; [DESIGN.md](DESIGN.md) records the implemented visual system.

## Checks

```sh
pnpm check                   # lint, typecheck, unit/API/WASM tests, production builds
pnpm format:check
pnpm exec playwright install chromium firefox webkit
pnpm test:e2e                # Chromium, Firefox, WebKit; starts the editor if necessary
pnpm test:integration        # requires the Compose services; disposable fixtures only
python3 -m venv /tmp/roveran-python
/tmp/roveran-python/bin/pip install -r tests/requirements.txt
ROVERAN_PYTHON=/tmp/roveran-python/bin/python pnpm test:parity
```

Parity tests execute all 25 generated Python programs with OpenCV 4.13 and compare actual output pixels against WASM. Exact operations require exact matches; architecture-sensitive rounding has explicit tolerances. Linear resizing uses `INTER_LINEAR_EXACT` in both implementations.

The worker acceptance test sends rapid superseding jobs, performs 200 edits, checks cache bounds, exports a larger original-resolution image, and measures both incremental and full-chain warmed latency. The 150 ms p95 budget applies to source decode → grayscale → Gaussian blur → Canny at a 1,024-pixel preview on the test machine. Hardware/browser measurements are recorded in `tests/reports/performance.json`; shared CI hardware can vary.

## Production

```sh
pnpm build
pnpm start                   # Fastify serves both /api and the built frontend
# Or build the deployment container:
docker build -t roveran .
```

Run migrations before starting a new deployment:

```sh
docker run --rm --env-file .env roveran node apps/api/dist/migrate.js
docker run --rm --env-file .env -p 3001:3001 roveran
```

Use deployment database/storage addresses reachable from the container; localhost inside the container refers to that container. Put HTTPS in front of the service and set `APP_ORIGIN` to its public origin. The image runs as the non-root `node` user. `/api/health` reports liveness and whether cloud services are configured.

## Image and runtime constraints

- PNG, JPEG and still WebP; up to 20 MiB and 16 megapixels per file, with at most 16,384 pixels on an edge.
- Up to 100 nodes and 20 source references per document.
- Browser decoding normalizes inputs to 8-bit sRGB. ICC profiles, EXIF orientation and JPEG decoder rounding may differ in native Python. Use normalized PNG fixtures for pixel-exact comparisons.
- Auto preview caps the longest source edge at 1,024 pixels and scales spatial parameters. Odd-kernel rounding makes previews approximate. Full-resolution mode/export uses exact parameters.
- Intermediate cache limit: 128 MiB; graph working matrices: 256 MiB. If a graph exceeds this budget, reduce source size or branches. WASM's reserved heap may remain at its high-water mark even after allocations are freed.
- Cancellation occurs between operations; synchronous OpenCV calls complete before cancellation. A 60-second watchdog can restart a stalled worker while keeping the saved document.
- AI assistance, live camera/video, public sharing, collaboration and custom SIMD/pthread builds are intentionally deferred.

`pnpm runtime:fetch` verifies the checked-in OpenCV runtime checksum or restores the pinned download. Its origin and SHA-256 are recorded beside the file. The runtime's Apache license is included. Production builds also collect dependency license texts, including the bundled font licenses, into `THIRD_PARTY_NOTICES.txt`. The fruit sample comes from [OpenCV's sample data](https://github.com/opencv/opencv/blob/4.13.0/samples/data/fruits.jpg); the calibration chart is generated by `scripts/generate-chart.py`.

## Verified build

The validation recorded for this implementation includes 57 unit/API/WASM tests, 4 real PostgreSQL/Better Auth/S3 integration tests, and all 25 generated Python programs. Eleven browser scenarios pass in each engine: Chromium and WebKit on macOS, Firefox in the official Playwright Linux container (the local macOS Firefox runtime could not open its temporary profile). The reference Chromium run measured approximately 57 ms p95 for a complete warmed preview and 14 ms p95 for incremental edits on Apple M4 Pro. Re-run the checks on deployment hardware before adopting those timings as a guarantee.

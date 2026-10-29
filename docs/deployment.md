# Deploying OpenCV WebLab

OpenCV WebLab is a static browser app: React, a Web Worker, and the pinned OpenCV WebAssembly runtime. GitHub Pages serves its HTML, JavaScript, fonts and samples over HTTPS. It needs no application server, database, API keys or hosting secrets. Image processing and saved experiments stay on the visitor's device.

- Repository: [nimaebra/opencv-weblab](https://github.com/nimaebra/opencv-weblab)
- Website: [OpenCV WebLab](https://nimaebra.github.io/opencv-weblab/)
- Pipeline: [CI and Deploy](https://github.com/nimaebra/opencv-weblab/actions/workflows/ci.yml)

GitHub Pages is available free for public repositories. See GitHub's [custom workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Automatic deployment

Push changes to `main` to run the complete pipeline. Pull requests and pushes to other branches run validation without deploying. The workflow also runs when a GitHub release is published, or manually through **Actions → CI and Deploy → Run workflow** on `main`.

1. Check formatting, lint, TypeScript, unit/WASM tests, the production build, the runtime checksum and Python/OpenCV parity.
2. Run the browser suite in Chromium, Firefox and WebKit on Ubuntu 24.04. This includes production service-worker updates, offline reopening, nested-path hosting, persistence, exports and accessibility checks. Worker timing measurements are recorded per browser; a hardware-specific performance budget is optional (see [validation](validation.md)).
3. Build `apps/web/dist` with the actual Pages base path reported by `actions/configure-pages`. Turbo includes `OPENCV_WEBLAB_BASE_PATH` in its build cache key.
4. Upload the site and deploy it to the `github-pages` environment using GitHub's short-lived deployment token. Failed checks prevent deployment.
5. For published releases, attach `opencv-weblab-static.tar.gz` and `SHA256SUMS` to the release after deployment succeeds. The archive is built for the Pages subdirectory shown above.

No personal access token or deployment secret is required in Actions. Repository contents are read-only by default; the deploy job alone can publish Pages, and the release job alone can attach release files. Dependabot checks for Action updates weekly.

## Publish a release

Update the package versions and `CHANGELOG.md` in a normal commit, push it to `main`, then create and publish a GitHub release with a version tag such as `v0.2.0`. Choose the intended commit as the target. Publishing the release validates and deploys that tagged source, then attaches its downloadable site archive and SHA-256 checksum. A draft release does not deploy.

The most recently completed deployment is the live site. Publishing a tag from an older commit intentionally rolls the site back to that version. To roll forward again, rerun the workflow on `main`. Avoid simultaneous release and branch deployments when their order matters. A release tag must contain this workflow for the release trigger to work.

## Repository settings

The initial setup uses a public repository with `main` as its default branch, **Settings → Pages → Source: GitHub Actions**, and HTTPS enabled. The `github-pages` environment accepts deployment from `main` and release tags. The workflow itself limits deployment to those events; a manual run on another branch only validates.

For a fork or a renamed repository, enable Pages with **GitHub Actions** as the source and run the workflow on `main`. The build reads the new base path automatically. Update the README badges and website links to the new owner and repository. Custom domains are optional and require separate DNS and Pages domain settings.

## Build and serve locally

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Open the Vite preview URL printed in the terminal. To reproduce project-site hosting:

```sh
OPENCV_WEBLAB_BASE_PATH=/opencv-weblab/ pnpm build
pnpm start
```

Open `http://localhost:4173/opencv-weblab/`. A deployed host only needs the contents of `apps/web/dist`; Node and pnpm run at build time. For another HTTPS static host, build with its URL prefix, serve `.js` as JavaScript and return 404 for missing assets. HTML and `sw.js` should revalidate so updates are detected. GitHub Pages manages its own cache headers.

## Verify or troubleshoot a deployment

Open the workflow run to inspect validation, build and deployment status. Failure artifacts include browser traces and parity evidence. The deploy job links directly to the published URL.

On the live site, wait for a working image preview and **Ready offline**, then reload once before testing offline access. Existing visitors may see **An update is ready**: **Save and update** saves their experiment before activating the new service worker. If persistence fails, the app asks them to download a backup first.

A 404 before the first deployment usually means Pages is disabled or the deployment has not completed. A runtime or worker 404 usually indicates an incorrect build base path. Inspect the failed request and rerun the build with the correct prefix. Never remove the project prefix from the live URL.

Experiments are stored per browser and origin. A new domain, another device or cleared browser data requires importing a downloaded `.opencv-weblab.zip` backup. The app continues to accept backups from its earlier format and retains the existing local database identifier during the name change.

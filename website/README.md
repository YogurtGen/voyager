# Voyager website

Static GitHub Pages website. HTML, CSS and native JavaScript modules; no package installation or bundler is needed. A small Node build adds content-derived URL versions so previous visitors receive updated CSS, scripts and assets after deployment.

From the repository root:

```sh
node scripts/serve-website.mjs
node scripts/check-website.mjs
node scripts/build-website.mjs
npm run typecheck
```

Preview: `http://127.0.0.1:4173/voyager/`. The server binds only to loopback and serves this directory, never application or library data.

## Publishing

GitHub Pages uses **GitHub Actions** as its source. The `Deploy Voyager website` workflow checks and builds only `website/` into a dedicated `.local/website-<content hash>` artifact, then deploys to `https://yogurtgen.github.io/voyager/`. The artifact contains only copied public site files, never the rest of `.local/`. A push to `main` that changes the site, build/check scripts or workflow updates the live page. It can also be run manually from Actions.

The Electron build and user libraries are separate from this website. Do not upload `dist/`, `.local/`, installed games, user settings or session data to Pages.

The initial fallback links point to the verified v0.1.0 release. Successful release metadata requests update links and the installer size. When changing the verified fallback release, update the HTML and fallback message together.

The browser demo is a local illustration, not a connection to Voyager or a native game. Arrow keys are handled only while the demo play area is focused; input is cleared on blur, cancellation, visibility changes and resizing.

See [CREDITS.md](CREDITS.md) for art direction, source and font attribution.

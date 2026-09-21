# Contributing

Thanks for taking a look. Quotlyn is small on purpose; keep it that way.

## Set up

```sh
git clone https://github.com/SteffenSchmitt/quotlyn.git
cd quotlyn
npm install
npm run dev:mock     # the app on http://localhost:15173 against a fake API, no token needed
```

`npm run dev` runs against the real API instead and needs a token from `claude setup-token`.
See [scripts/screenshots/README.md](scripts/screenshots/README.md) for the mock and the
screenshot tooling.

## Before you open a pull request

```sh
npm test         # Vitest, the pure logic
npm run build    # vue-tsc + Vite; this is the type gate, it also checks the .vue files
```

Both run in CI on every push and pull request. Add a test for logic you touch: parsing,
polling, thresholds, forecast, export and import live in framework-free modules under `src/lib`,
`src/notify`, `src/scheduler` and `src/storage`, and components stay thin.

## Conventions

- Conventional commit subjects: `feat:`, `fix:`, `style:`, `docs:`, `ci:`, `chore:`. The subject
  becomes a CHANGELOG line, so say what changed for the user.
- German and English strings live in `src/i18n`; add both.
- No new runtime dependencies without a good reason; the proxy has none at all.
- Never paste a token, an organisation id or a history export with identifying headers into an
  issue or a pull request.

## Releases

Maintainers cut releases with `npm run release -- <version|major|minor|patch>`. It runs the checks,
bumps `package.json` and the README badge, regenerates `CHANGELOG.md` from the git tags, commits,
tags and pushes. The header of the app shows the version.

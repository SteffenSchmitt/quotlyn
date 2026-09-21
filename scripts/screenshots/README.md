# Screenshots and the mock API

Everything here runs against a fake Messages API, so no real token is needed.

## Run the app against the mock

```sh
npm run dev:mock        # mock API on :18999, proxy on :18787, web UI on http://localhost:15173
```

Tokens the mock knows: `sk-ant-oat01-AAAA`, `-BBBB`, `-CCCC` (answers after 6 s) and `-DDDD`
(limit reached). Any passphrase works for the vault, it lives in your browser only.

## README screenshots

`docs-shoot.js` seeds a day of synthetic history; `docs-shoot-live.js` seeds a real history export
(Settings › Data › History as JSON, without identifying headers) and needs `replay-upstream.mjs`
instead of the mock, which replays each account's last reading:

```sh
npm run dev:mock                                          # synthetic
node scripts/screenshots/docs-shoot.js out

node scripts/screenshots/replay-upstream.mjs history.json # real export, instead of the mock
QUOTLYN_UPSTREAM=http://localhost:18999 QUOTLYN_PROXY_PORT=18787 node proxy/server.mjs
QUOTLYN_PROXY_PORT=18787 npx vite --port 15173
node scripts/screenshots/docs-shoot-live.js out history.json
```

Both scripts drive the installed Google Chrome through playwright-core (a dev dependency), dark
theme, 1440 × 900 at 2×, and write the six images the README uses; copy them to `docs/screenshots/`.

`shoot.js` takes QA shots instead: light and dark, narrow viewport, hover states, raw headers.

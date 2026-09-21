# Quotlyn

A small, self-hosted dashboard that keeps an eye on the usage limits of
multiple Claude subscription accounts.

Quotlyn runs locally in a single Docker container. It polls every configured
account on an interval, keeps a history in your browser and renders the
current state as gauges, trend charts and a reset timeline.

## Features

- Several accounts side by side, each with its own colour.
- Gauges per limit window (5 h, 7 d and whatever else the API reports) with
  live countdowns to the next reset, plus an overview sorted by remaining room.
- History charts per account and window (24 h / 7 d / 30 d) with reset markers.
- Timeline of upcoming resets across all accounts.
- Browser notifications when a window crosses your warn/critical thresholds.
- Raw response headers per account, with identifying values masked by default
  and unknown headers highlighted, so nothing the API returns is hidden.
- Tokens are stored encrypted (PBKDF2 + AES-GCM) behind a passphrase in your
  browser. Export/import of the encrypted account file, CSV/JSON export of the
  history.
- German and English UI, light and dark theme.

## Requirements

- Docker with Compose, or Node 22+.
- One long-lived token per account, created with the Claude CLI:

  ```sh
  claude setup-token
  ```

  The token starts with `sk-ant-oat01-`. Treat it like a password: it grants
  full inference access to that subscription.

## Run

```sh
docker compose up --build
```

Open <http://localhost:5173>, choose a passphrase, add your accounts under
*Accounts* and press *Test token*. Without Docker:

```sh
npm install
npm run dev
```

## How it gets the numbers

Tokens from `claude setup-token` only carry the inference scope, so the
dedicated usage endpoint rejects them. Quotlyn instead sends the cheapest
possible request (one output token on Haiku) and reads the
`anthropic-ratelimit-unified-*` headers of the response, which is exactly
what the Claude CLI shows under `/usage`. Each poll costs roughly ten tokens of
your quota; the default interval is five minutes and every account is polled
sequentially with a short gap.

The bundled proxy (`proxy/server.mjs`, no dependencies) exists only because a
browser cannot call the API directly. It forwards your token, sends the probe
request and returns the headers as JSON. It stores nothing and never logs
headers or bodies.

## Security notes

- Run Quotlyn only on a machine you control. Anyone who can reach port 5173
  and knows your passphrase can read your tokens.
- The passphrase is never stored. "Keep unlocked for this session" keeps the
  derived key in `sessionStorage` until the tab is closed.
- History exports never contain tokens. Identifying headers (organisation and
  workspace ids) are only included if you tick the box.

## Development

```sh
npm test          # Vitest
npm run typecheck # vue-tsc
```

Set `QUOTLYN_UPSTREAM=http://localhost:PORT` to point the proxy at a mock
server during development, and `QUOTLYN_PROBE_MODEL` to change the probe
model.

## License

MIT, see [LICENSE](LICENSE).

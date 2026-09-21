# Quotlyn

A small, self-hosted dashboard that keeps an eye on the usage limits of
multiple Claude subscription accounts.

Quotlyn runs locally in a single Docker container. It polls the usage
endpoint for every configured account, stores a history in your browser and
renders the current state as gauges, trend charts and a reset timeline.

## Status

Accounts are polled every five minutes (configurable), every result is kept as a local snapshot, and the dashboard shows gauges per window with countdowns, an overview sorted by remaining headroom and the raw response headers. A history view plots utilization over time per account and a timeline shows upcoming resets.

## Run locally

```sh
docker compose up --build
```

Then open <http://localhost:5173>. The container runs the Vite dev server and a
small proxy that turns a one-token Messages API request into usage data
(Anthropic returns the subscription limits as response headers). Source
changes reload live.

Without Docker: `npm install && npm run dev` (Node 22 or newer).

## How it gets the numbers

Tokens created with `claude setup-token` only carry the inference scope, so the
dedicated usage endpoint rejects them. Quotlyn instead sends the cheapest
possible request (one output token on Haiku) and reads the
`anthropic-ratelimit-unified-*` headers of the response. Every poll costs about
ten tokens of your quota.

## Principles

- Local only. Your tokens never leave your machine; they are stored
  encrypted in your browser and only ever sent to the bundled proxy.
- Minimal. One container, one command, no database server.
- Honest. Every field the API returns is shown, including ones the
  dashboard does not (yet) visualise.

## License

MIT, see [LICENSE](LICENSE).

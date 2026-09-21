# Quotlyn

A small, self-hosted dashboard that keeps an eye on the usage limits of
multiple Claude subscription accounts.

Quotlyn runs locally in a single Docker container. It polls the usage
endpoint for every configured account, stores a history in your browser and
renders the current state as gauges, trend charts and a reset timeline.

## Status

Early planning. No application code yet.

## Principles

- Local only. Your tokens never leave your machine; they are stored
  encrypted in your browser and only ever sent to the bundled proxy.
- Minimal. One container, one command, no database server.
- Honest. Every field the API returns is shown, including ones the
  dashboard does not (yet) visualise.

## License

MIT, see [LICENSE](LICENSE).

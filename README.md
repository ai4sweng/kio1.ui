# KIO Operator UI

The existing operator interface, extracted into an independently buildable project. Nginx serves the unchanged visual assets and proxies `/api/...` to KIO1. The browser never connects directly to dummy agents or Ollama. No Python or npm runtime dependencies are required.

## Build and Run

Run from this project root with Docker installed:

```bash
make build
make run
```

Open **http://127.0.0.1:5000**. In separate terminals, start the KIO1 API and dummy-kios projects using their own READMEs. UI joins `kio1-network` and sends API requests to `http://kio1:5000`. `make run` is foreground; Ctrl+C stops and removes UI, not backend data.

Override deployment settings when needed:

```bash
make run UI_PORT=5001 KIO_NETWORK=kio1-network KIO1_API_URL=http://kio1:5000
```

`KIO1_API_URL` is a trusted operator setting: an HTTP(S) base URL without a trailing slash or path. Docker DNS is re-resolved so backend recreation does not require rebuilding UI. If a port is occupied, choose another; do not stop unrelated listeners. Build before starting. No configuration is shared through source imports or sibling mounts.

## Independent Development and Tests

Node.js 18+ is required only for tests:

```bash
make check
```

Tests cover existing workflow edits, deletion and dependency cleanup, canonical capabilities, dispatch payloads, busy controls, static assets, settings initialization, safe text insertion, and failed settings requests. No KIO1 checkout or running model is required.

See [Development](docs/development.md) for implementation guidance and [Operations](docs/operations.md) for proxy behavior and troubleshooting.

## Operations

Use `make up` for detached mode with `unless-stopped`; `make logs`, `make status`, `make stop`, and `docker start kio-ui` manage the existing container. Rebuild after frontend or proxy edits. For detached replacements, stop and rename the old `kio-ui` container before relaunching; do not prune unrelated containers.

`/health` checks UI serving only. Backend settings are loaded before chat/history initialization. Failure leaves chat input and workflow dispatch disabled; reload after KIO1 recovers. No workflow is replayed or dispatched automatically. Proxy failures remain visible to the browser and nginx logs.

UI publishes only to loopback. For remote access use an SSH tunnel or an authenticated reverse proxy; do not expose the single-operator application publicly. Same-origin requests preserve existing API methods, bodies, statuses, and headers without CORS changes. Uploads retain the 2 GiB limit; workflow requests retain KIO1's 1 MiB limit. Proxy buffering and retries are disabled, with a one-hour response timeout to avoid truncating configured long model/workflow requests. This does not add authentication or durable workflows.

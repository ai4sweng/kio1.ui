# UI Operations

## Request Path

Browser -> UI nginx -> KIO1 API -> external Ollama or selected agent. Nginx preserves `/api/` paths and query strings and forwards request bodies, authorization headers, and upstream error status codes. Only KIO1 makes dispatch decisions. UI settings contain model name, capability catalog, and whether dispatch is configured, never credentials.

Nginx uses Docker's embedded DNS resolver. Settings are loaded once per page load, matching the old rendered-page behavior. Restart KIO1 after prompt/catalog changes and reload UI. A settings error does not enable dispatch. A UI `/health` response alone is not backend readiness.

## Three-Terminal Deployment

1. Dummy terminal: `make build run` in the dummy-kios checkout.
2. KIO1 terminal: `make prepare build`, verify external Ollama, then `make run AGENT_CONFIG=agents.json` using a local registry copied from its example.
3. UI terminal: `make build run`, then open `http://127.0.0.1:5000`.

Use one shared network and build each project independently. Detached `make up` targets keep containers running after logout, provided Docker and external Ollama remain running. SSH tunnels expose only loopback browser access; retain host firewall restrictions on Ollama.

## Troubleshooting

- UI unavailable: inspect `make logs` and `make status`; verify the published port.
- Settings/proxy 502: check `kio1` network membership, DNS alias, and API startup logs. Model preload completes before the API binds. Reload when recovered.
- Settings invalid: verify `GET /api/settings` comes from the expected KIO1 API, not an old combined deployment.
- Workflow controls absent: configure a trusted registry in KIO1 and reload UI.
- Upload rejected: preserve nginx's 2 GiB limit and KIO1's category and filename validation. Storage remains in KIO1.
- Long request timeout: compare nginx's one-hour timeout against configured model/workflow limits before changing either.
- Remote reverse proxy: change its upstream to UI's loopback published port, not KIO1's private API container.

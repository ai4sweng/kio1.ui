# UI Implementation Guidance

## Ownership

- [templates/index.html](../templates/index.html): static page, no Jinja or KIO1 imports.
- [static/app.js](../static/app.js): rendering, operator interactions, settings and history initialization.
- [static/style.css](../static/style.css): existing visual design, preserved during extraction.
- [nginx.conf.template](../nginx.conf.template): same-origin API proxy and static serving.
- [tests/test_ui.js](../tests/test_ui.js): Node built-in test runner with isolated DOM adapters.

Keep capability definitions, session state, persistence, LLM requests, and dispatch decisions in KIO1. Obtain the current public catalog from `GET /api/settings`; do not duplicate it here. Use relative `/api/...` requests, `textContent` for model/status text, and existing escaping for generated markup. Preserve operator approval and send current edits rather than the original plan.

## Change Workflow

1. Add or update focused cases in the existing Node suite.
2. Run `make check` without backend services.
3. Run `make build` and test through nginx against a configured backend.
4. For cross-project verification, run KIO1's `make test-stack` with explicit UI and dummy source paths.
5. Inspect desktop/mobile layout, assets, error states, and nginx logs before shipping.

No npm install is needed. Keep static paths stable and controls disabled until settings load. Do not add client-side workflow retries or expose registry endpoints/tokens. Proxy settings are trusted deployment configuration, not browser-controlled input. The nginx image runs unprivileged on port 8080.

## Test Migration

The original six workflow-editor tests moved unchanged in intent. Flask's former page assertions now live in the static-page test; the configured-catalog and script-injection assertions now live in the settings/bootstrap rendering test. KIO1 separately tests the public settings contract. Server-side HTML interpolation no longer exists.

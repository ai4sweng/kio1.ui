.DEFAULT_GOAL := help
DOCKER ?= docker
UI_IMAGE ?= kio-ui:latest
UI_PORT ?= 5000
KIO_NETWORK ?= kio1-network
KIO1_API_URL ?= http://kio1:5000

.PHONY: help test check build network run up logs status stop down
help:
	@printf 'Targets: test check build run up logs status stop down\n'
test:
	node --test tests/test_ui.js
check: test
	node --check static/app.js
build:
	$(DOCKER) build -t $(UI_IMAGE) .
network:
	$(DOCKER) network inspect "$(KIO_NETWORK)" >/dev/null 2>&1 || $(DOCKER) network create "$(KIO_NETWORK)"
run: network
	$(DOCKER) run --rm --name kio-ui --network "$(KIO_NETWORK)" -p 127.0.0.1:$(UI_PORT):8080 -e KIO1_API_URL="$(KIO1_API_URL)" $(UI_IMAGE)
up: network
	$(DOCKER) run -d --name kio-ui --restart unless-stopped --network "$(KIO_NETWORK)" -p 127.0.0.1:$(UI_PORT):8080 -e KIO1_API_URL="$(KIO1_API_URL)" $(UI_IMAGE)
logs:
	$(DOCKER) logs -f kio-ui
status:
	$(DOCKER) ps -a --filter name=^/kio-ui$$
stop:
	$(DOCKER) stop kio-ui
down:
	$(DOCKER) rm -f kio-ui
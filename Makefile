# The version deployed is the newTag in k8s/kustomization.yaml; VERSION
# defaults to it.
VERSION   ?= $(shell sed -n "s/^ *newTag: *//p" k8s/kustomization.yaml | head -1)
REGISTRY  := ghcr.io/c88lopez
NAMESPACE := padel-admin
# Where Postgres runs (the platform repo's manifests/data/).
DATA_NS   := data

.PHONY: tunnel dev-setup dev-reset run test test-integration test-e2e seed admin-password image secrets status logs restart

## --- local ---
# Local runs use the cluster's Postgres through `make tunnel`, as
# padel_admin_dev: a user that owns only these three databases, and that
# Postgres refuses on any other (platform repo, manifests/data/postgres.yaml).
# Development never touches the deployed app's padel_admin database or holds
# its user's password. Override with the LOCAL_* variables.
#
#   run, dev-reset     padel_admin_dev
#   test-integration   padel_admin_test
#   test-e2e           padel_admin_e2e, wiped and reseeded every run
secret = $(shell kubectl -n $(DATA_NS) get secret $(1) -o jsonpath='{.data.$(2)}' | base64 -d)
# Percent-encoded: a password with @, / or : would otherwise break the URL.
uri    = $(shell jq -rn --arg v '$(1)' '$$v|@uri')
# Each password is fetched once, and only by targets that use it.
DEV_PASS = $(eval DEV_PASS := $(call uri,$(call secret,padel-admin-dev-postgres-role,password)))$(DEV_PASS)
# The deployed app's user: only `secrets` and `seed`, which act on the cluster.
PG_PASS  = $(eval PG_PASS := $(call uri,$(call secret,padel-admin-postgres-role,password)))$(PG_PASS)

LOCAL_DATABASE_URL      ?= postgres://padel_admin_dev:$(DEV_PASS)@localhost:5432/padel_admin_dev
LOCAL_TEST_DATABASE_URL ?= postgres://padel_admin_dev:$(DEV_PASS)@localhost:5432/padel_admin_test
LOCAL_E2E_DATABASE_URL  ?= postgres://padel_admin_dev:$(DEV_PASS)@localhost:5432/padel_admin_e2e

# Leave it running in its own terminal. Postgres's default port: there's no
# local Postgres to clash with (importer's and deny-list's tunnels use 5433).
tunnel: ## forward the cluster's Postgres to localhost:5432
	kubectl -n $(DATA_NS) port-forward svc/postgres-rw 5432:5432

dev-setup: ## once: create the dev, test and e2e databases in the cluster (needs the padel_admin_dev role from the platform repo)
	kubectl apply -f k8s/dev/

# reset-e2e.ts empties whatever database E2E_DATABASE_URL names, then migrates
# and seeds the demo data (logins in the README).
dev-reset: export E2E_DATABASE_URL = $(LOCAL_DATABASE_URL)
dev-reset: ## empty padel_admin_dev and reseed it with demo data; also the first-time setup (needs make tunnel)
	bun run db:e2e:reset

# Migrates first, so a branch's new migrations are in place before its code
# runs. Only on padel_admin_dev: the deployed database gets them on deploy.
run: export DATABASE_URL = $(LOCAL_DATABASE_URL)
run: ## the dev server on :3003 against padel_admin_dev, after applying pending migrations (needs make tunnel)
	bun run db:migrate
	bun run dev

test: test-integration ## unit tests, then the integration tests (needs make tunnel)

test-integration: export DATABASE_URL_TEST = $(LOCAL_TEST_DATABASE_URL)
test-integration: ## unit tests, plus the integration suite against padel_admin_test (needs make tunnel)
	bun run test

test-e2e: export E2E_DATABASE_URL = $(LOCAL_E2E_DATABASE_URL)
test-e2e: ## Playwright against padel_admin_e2e, which it wipes first (needs make tunnel)
	bun run test:e2e

# The clubs and the Owner account (admin@club.test) the app starts with, on a
# fresh database. The password goes into the padel-admin-seed-accounts Secret
# (`make admin-password` prints it), not into the terminal: the seed prints it.
# Idempotent: an existing admin is kept, password included. A cluster task, not
# development: it runs as the deployed app's user, on its database.
seed: export DATABASE_URL = postgres://padel_admin:$(PG_PASS)@localhost:5432/padel_admin
seed: ## once, on a new cluster: seed the deployed padel_admin database (needs make tunnel)
	@kubectl -n $(NAMESPACE) get secret padel-admin-seed-accounts >/dev/null 2>&1 \
	  || kubectl -n $(NAMESPACE) create secret generic padel-admin-seed-accounts \
	       --from-literal=email=admin@club.test --from-literal=password="$$(openssl rand -base64 18 | tr -d '/+=')"
	@p=$$(kubectl -n $(NAMESPACE) get secret padel-admin-seed-accounts -o jsonpath='{.data.password}' | base64 -d); \
	  SEED_ADMIN_PASSWORD="$$p" bun run db:seed | sed "s/$$p/<make admin-password>/"

admin-password: ## print the seeded Owner's login
	@kubectl -n $(NAMESPACE) get secret padel-admin-seed-accounts -o go-template='{{.data.email | base64decode}} {{.data.password | base64decode}}{{"\n"}}'

image: ## build the image locally to try it (CI builds the one the cluster uses)
	docker build -t $(REGISTRY)/padel-admin:$(VERSION) .

## --- kubernetes ---
# DATABASE_URL goes through PgBouncer (postgres-pooler-rw), which is in
# transaction mode; MIGRATE_DATABASE_URL goes straight to postgres-rw, for the
# migrate Job (k8s/jobs/migrate.yaml). See deny-list's Makefile for the budget.
#
# The generated secrets (BETTER_AUTH_SECRET, TOOL_APPROVAL_SECRET and the two
# API keys) are kept when the Secret already has them: a new BETTER_AUTH_SECRET
# would log everyone out. AI_GATEWAY_API_KEY comes from the environment, or
# else from .env; without one the assistant is off.
#
# --server-side: a client-side apply would keep a plain-text copy of the
# values in the last-applied-configuration annotation. The namespace is Argo
# CD's: only create it if it doesn't exist yet (before the first sync).
# @: the recipe holds passwords, so make doesn't echo it.
secrets: ## create or update the app's Secret (padel-admin-deps)
	kubectl get namespace $(NAMESPACE) >/dev/null 2>&1 || kubectl apply -f k8s/00-namespace.yaml
	@echo "kubectl -n $(NAMESPACE) create secret generic padel-admin-deps (DATABASE_URL, MIGRATE_DATABASE_URL, BETTER_AUTH_SECRET, TOOL_APPROVAL_SECRET, ADMIN_API_KEY, PLATFORM_API_KEY, AI_GATEWAY_API_KEY)"
	@keep() { v=$$(kubectl -n $(NAMESPACE) get secret padel-admin-deps -o jsonpath="{.data.$$1}" 2>/dev/null | base64 -d); \
	    [ -n "$$v" ] && echo "$$v" || openssl rand -base64 32; }; \
	  ai="$${AI_GATEWAY_API_KEY:-$$(sed -n 's/^AI_GATEWAY_API_KEY=//p' .env 2>/dev/null)}"; \
	  [ -n "$$ai" ] || echo "no AI_GATEWAY_API_KEY: the assistant stays off"; \
	  kubectl -n $(NAMESPACE) create secret generic padel-admin-deps \
	  --from-literal=DATABASE_URL="postgres://padel_admin:$(PG_PASS)@postgres-pooler-rw.$(DATA_NS).svc.cluster.local:5432/padel_admin" \
	  --from-literal=MIGRATE_DATABASE_URL="postgres://padel_admin:$(PG_PASS)@postgres-rw.$(DATA_NS).svc.cluster.local:5432/padel_admin" \
	  --from-literal=BETTER_AUTH_SECRET="$$(keep BETTER_AUTH_SECRET)" \
	  --from-literal=TOOL_APPROVAL_SECRET="$$(keep TOOL_APPROVAL_SECRET)" \
	  --from-literal=ADMIN_API_KEY="$$(keep ADMIN_API_KEY)" \
	  --from-literal=PLATFORM_API_KEY="$$(keep PLATFORM_API_KEY)" \
	  --from-literal=AI_GATEWAY_API_KEY="$$ai" \
	  --dry-run=client -o yaml | kubectl apply --server-side --force-conflicts -f -

status: ## show everything running in the namespace
	kubectl -n $(NAMESPACE) get all,configmap -o wide

logs: ## stream the pods' logs
	kubectl -n $(NAMESPACE) logs -l app=padel-admin -f --prefix

restart: ## recreate the pods (e.g. after changing the ConfigMap or Secret)
	kubectl -n $(NAMESPACE) rollout restart deployment/padel-admin
	kubectl -n $(NAMESPACE) rollout status deployment/padel-admin

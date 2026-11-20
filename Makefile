# The version deployed is the newTag in k8s/kustomization.yaml; VERSION
# defaults to it.
VERSION   ?= $(shell sed -n "s/^ *newTag: *//p" k8s/kustomization.yaml | head -1)
REGISTRY  := ghcr.io/c88lopez
NAMESPACE := padel-admin
# Where Postgres runs (the platform repo's manifests/data/).
DATA_NS   := data

.PHONY: tunnel dev-setup migrate-local seed image secrets status logs restart

## --- local ---
# Local runs use the cluster's Postgres through `make tunnel`, with the
# password read from padel-admin-postgres-role (fetched once, and only by
# targets that use it). Override with LOCAL_DATABASE_URL.
secret = $(shell kubectl -n $(DATA_NS) get secret $(1) -o jsonpath='{.data.$(2)}' | base64 -d)
# Percent-encoded: a password with @, / or : would otherwise break the URL.
uri    = $(shell jq -rn --arg v '$(1)' '$$v|@uri')
PG_PASS = $(eval PG_PASS := $(call uri,$(call secret,padel-admin-postgres-role,password)))$(PG_PASS)

LOCAL_DATABASE_URL ?= postgres://padel_admin:$(PG_PASS)@localhost:5433/padel_admin

# Leave it running in its own terminal. The same port as importer's and
# deny-list's tunnels, so any one of them serves all three.
tunnel: ## forward the cluster's Postgres to localhost:5433
	kubectl -n $(DATA_NS) port-forward svc/postgres-rw 5433:5432

dev-setup: ## once: create the test and e2e databases in the cluster (needs the padel_admin role from the platform repo)
	kubectl apply -f k8s/dev/

migrate-local: export DATABASE_URL = $(LOCAL_DATABASE_URL)
migrate-local: ## apply pending migrations to the real padel_admin database (needs make tunnel)
	bun run db:migrate

# The two accounts the app starts with. Set SEED_ADMIN_PASSWORD and
# SEED_SUPERADMIN_PASSWORD: without them the seed uses the README's defaults.
seed: export DATABASE_URL = $(LOCAL_DATABASE_URL)
seed: ## seed the real padel_admin database: SEED_ADMIN_PASSWORD=… SEED_SUPERADMIN_PASSWORD=… make seed (needs make tunnel)
	@test -n "$$SEED_ADMIN_PASSWORD" -a -n "$$SEED_SUPERADMIN_PASSWORD" \
	  || { echo "set SEED_ADMIN_PASSWORD and SEED_SUPERADMIN_PASSWORD"; exit 1; }
	bun run db:seed

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

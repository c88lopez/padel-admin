# --- build stage: the Nitro server bundle and the migration runner ---
# Runs on the build machine's own arch: the output is plain JavaScript with no
# native modules, so building for amd64 on an arm64 Mac needs no emulation.
FROM --platform=$BUILDPLATFORM oven/bun:1.3.14-alpine AS build
WORKDIR /src
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
# node-server: a self-contained Node bundle in .output/ (no node_modules needed
# at runtime). Without it Nitro guesses the preset from the environment.
ENV NITRO_PRESET=node-server
RUN bun run build
# The migrate Job runs this with Node: src/db/migrate.ts and pg in one file.
RUN bun build src/db/migrate.ts --target=node --outfile=dist/migrate.mjs

# --- runtime stage: Node and the app, no shell or package manager, non-root ---
FROM gcr.io/distroless/nodejs24-debian12:nonroot
WORKDIR /app
COPY --from=build /src/.output ./.output
# For the migrate Job: node dist/migrate.mjs reads ./drizzle (process.cwd()).
COPY --from=build /src/dist ./dist
COPY --from=build /src/drizzle ./drizzle
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
# Numeric UID (distroless "nonroot"): the kubelet can only verify runAsNonRoot
# from a number, since it can't look up user names inside the image.
USER 65532:65532
EXPOSE 3000
# The image's entrypoint is node.
CMD [".output/server/index.mjs"]

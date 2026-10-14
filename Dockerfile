# Official Node22.23.3 multi-platform manifest; product Fargate target is linux/amd64.
FROM --platform=$BUILDPLATFORM node:22.23.3-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json .npmrc tsconfig.json tsconfig.build.json ./
COPY apps ./apps
COPY packages ./packages
COPY infra/cdk ./infra/cdk
# postinstall must exist BEFORE npm ci; no framework/runtime or synthetic identity fixture is copied.
COPY scripts/u1 ./scripts/u1
COPY scripts/u2 ./scripts/u2
RUN npm ci
RUN npm run verify:u1:cdk-bundle
RUN npx tsc --noEmit --project tsconfig.build.json
RUN npx next build --webpack apps/customer-web
RUN npx next build --webpack apps/staff-web
RUN rm -rf node_modules apps/customer-web/.next/cache apps/staff-web/.next/cache
FROM node:22.23.3-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS install-runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app /app
RUN npm_config_omit=dev npm ci --omit=dev
FROM gcr.io/distroless/cc-debian13:nonroot@sha256:e792ab3d241a468a4fd7519ddbbebe66b49b5f365771716ea688ad40b6c6f1c2 AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PATH=/usr/local/bin
COPY --from=install-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=install-runtime --chown=1000:1000 /app /app
USER 1000:1000
EXPOSE 8443
CMD ["/usr/local/bin/node","--import","tsx","apps/api/src/main.ts"]

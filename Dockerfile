# Pin base images to SHA digests for reproducible, supply-chain-safe builds.
# CI (validate-quality.yml, "Dockerfile base image digest check") fails when a
# FROM line uses a floating tag without @sha256.
FROM node:26-bookworm@sha256:fa52d1669505e29b58c042875b1d65c229e0787a3610fd52869b22b68e480853 AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

ARG BUILD_VERSION=dev
ARG SOURCE_DATE_EPOCH=0
ARG VITE_KEYCLOAK_URL=http://localhost:8080
ARG VITE_APP2_URL=http://localhost:5002

ENV SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH} \
    VITE_KEYCLOAK_URL=${VITE_KEYCLOAK_URL} \
    VITE_APP2_URL=${VITE_APP2_URL}

RUN npm run build

FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:b5047b9b76845eac124358373c6852377c52e4b05834a47647e955dd91cb8f1e

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=${BUILD_VERSION}

LABEL org.opencontainers.image.title="web-shell" \
      org.opencontainers.image.source="https://github.com/BCBP-SOLUTIONS-FZC-LLC/web-shell" \
      org.opencontainers.image.vendor="BCBP Solutions FZC LLC" \
      org.opencontainers.image.revision="${BUILD_VERSION}"

# The pinned base lags Alpine security fixes, so upgrade its packages to keep
# the Trivy gate green. Remove this step once nginxinc rebuilds often enough.
USER 0
# hadolint ignore=DL3017,DL3018
RUN apk upgrade --no-cache

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
# 101 is the nginx user in nginxinc/nginx-unprivileged. A name fails Hadolint DL3066.
COPY --from=builder --chown=101:101 /app/dist /usr/share/nginx/html

EXPOSE 8080

USER 101

# Pin base images to SHA digests for reproducible, supply-chain-safe builds.
# CI (validate-quality.yml, "Dockerfile base image digest check") fails when a
# FROM line uses a floating tag without @sha256.
FROM node:22-bookworm@sha256:63538dfe497cc29dfafdda25ada09b46db68a3f4cc205abf1f5d6bf0913f3384 AS builder

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

FROM nginxinc/nginx-unprivileged:1.27-alpine@sha256:65e3e85dbaed8ba248841d9d58a899b6197106c23cb0ff1a132b7bfe0547e4c0

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=${BUILD_VERSION}

LABEL org.opencontainers.image.title="web-shell" \
      org.opencontainers.image.source="https://github.com/BCBP-SOLUTIONS-FZC-LLC/web-shell" \
      org.opencontainers.image.vendor="BCBP Solutions FZC LLC" \
      org.opencontainers.image.revision="${BUILD_VERSION}"

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
# 101 is the nginx user in nginxinc/nginx-unprivileged. A name fails Hadolint DL3066.
COPY --from=builder --chown=101:101 /app/dist /usr/share/nginx/html

EXPOSE 8080

USER 101

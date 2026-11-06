# ADR 0007: The nginx image until CloudFront + S3

**Status:** accepted (pending Architecture Review where it records an exception) · **Date:** 2026-11-06 · **Constitution:** Frontend Architecture Constitution 1.0

## Context

The constitution's frontend hosting is S3 + CloudFront. CloudFront is not available until next month. The release already publishes the static bundle (`web-shell_<tag>_dist.tar.gz`) next to the signed nginx image.

## Decision

Until CloudFront exists, environments serve the nginx image behind their ingress (`docs/hosting-without-cloudfront.md`: path routing, CSP and HSTS as mounted files). When CloudFront arrives, the release tarball is uploaded to S3 and CloudFront takes over routing and headers (`platform-reactcommon` `examples/cloudfront`); the image's `security.d` mounts are removed.

## Consequences

The same build (one for every environment since alpha.6) serves both; nginx follows CloudFront's SPA rule, so behaviour does not change at the switch. The smoke suite (`SMOKE_MODE=live`) checks either.

## Revisit

At the CloudFront launch: move hosting, then retire the image or keep it for non-AWS environments.

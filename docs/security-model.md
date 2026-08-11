# Security model

AssumeKit sits on an authentication boundary. This document describes what the library is designed to protect, what it assumes, and what it does **not** protect.

AssumeKit has not undergone a formal third-party security audit. Treat the current release line as early alpha until the real-cloud E2E and release hardening are complete.

## Assets

The most sensitive values handled by the runtime are:

1. the short-lived Google service-account ID token;
2. the AWS temporary access key ID, secret access key, and session token returned by STS.

The configured AWS role ARN, token audience, and target endpoint are identifiers/configuration, not credentials.

## Trust boundaries

```text
Cloud Run process
  │
  ├─ HTTP → Google metadata server
  │           returns short-lived Google ID token
  │
  ├─ HTTPS → Regional AWS STS
  │           validates token + IAM role trust policy
  │           returns temporary AWS credentials
  │
  └─ HTTPS → allowlisted target AWS service host
              SigV4 request using temporary credentials
```

Security depends on all of these layers:

- Cloud Run service identity configuration;
- AWS IAM role trust policy;
- AWS IAM role permissions policy;
- application/container integrity;
- target AWS service authorization;
- safe logging/observability practices.

## Security properties provided by AssumeKit

### No long-lived AWS key requirement

The intended flow starts from the Cloud Run service identity and exchanges a Google-signed ID token for temporary AWS credentials. AssumeKit does not require `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` or a Google service-account private-key file.

### Audience-scoped federation

`gcpMetadataIdentity()` requests an ID token for an explicit audience. The AWS trust policy should pin that audience via `accounts.google.com:oaud` and pin the service account using the stable numeric unique ID in the mapped `aud`/`sub` conditions.

### Fixed credential-exchange destinations

- The GCP metadata base URL is fixed by the provider implementation.
- The AWS STS endpoint is derived from the configured AWS Region.
- The public API does not accept an arbitrary STS endpoint.
- Metadata and STS fetches use `redirect: error`.

These choices reduce the chance that an identity token is accidentally posted to an attacker-controlled redirect/endpoint through normal configuration.

### Explicit signed-request destination allowlist

`createAwsFetch()` requires at least one `allowedHosts` entry. Before any workload identity token or AWS temporary credential is obtained, each target request is rejected unless it:

- is an absolute HTTPS URL;
- has no URL credentials; and
- exactly matches an allowlisted host, including a non-default port when one is used.

This prevents untrusted request input from selecting an arbitrary destination for a SigV4-signed request under normal library use. The allowlist is host-level only; application authorization must still control paths, methods, query parameters, and payloads.

### Temporary credentials stay in memory

AssumeKit does not persist temporary AWS credentials to disk, a database, environment variables, or an application config file.

### Bounded credential retries

Transient metadata/STS failures use bounded retry with full jitter. Service-call retries are separate and default to `0` to avoid replaying non-idempotent target operations.

### Single-flight credential refresh

Concurrent requests share one in-progress refresh, reducing unnecessary identity-token issuance and STS role sessions. A rejected refresh promise is cleared so a later request can recover instead of retaining the failed refresh indefinitely.

### Defensive input validation

The library validates role/session/region/service-related configuration, signed-request hosts, and GCP metadata path segments.

## Responsibilities outside the library

### Least-privilege AWS role permissions

AssumeKit can obtain only what the target role permits. A broad role policy turns a small authentication library into a high-impact credential path. Scope role permissions to the exact APIs/resources the workload needs.

### Restrictive role trust policy

Do not trust `accounts.google.com` without conditions. Pin both the Google service-account identity and the expected audience.

See [GCP → AWS trust policy](gcp-aws-trust.md).

### Dedicated Cloud Run service identity

Use a dedicated user-managed service account for the workload. Avoid using a broadly privileged default service account where practical.

### Application compromise

If an attacker gains arbitrary code execution inside the Cloud Run container/process, AssumeKit cannot protect the workload's ambient identity. The attacker can potentially request identity tokens and use whatever AWS permissions the trusted role grants.

Container/runtime hardening and least-privilege IAM remain required.

### Untrusted request paths and payloads

The signed-host allowlist prevents callers from switching to an arbitrary destination host, but it does not decide whether a particular path, method, query string, or payload is authorized. Do not expose a generic signed-request proxy to untrusted users without an application-level authorization model.

### Request replay when enabling service retries

`retries` defaults to `0`. If you enable retries, understand the target operation's idempotency behavior. The library cannot infer whether an arbitrary MCP/API POST is safe to replay.

### Logging

Never log Google ID tokens or AWS temporary credentials. Treat Authorization headers as secrets.

Role session names and federation attributes can appear in CloudTrail, so use non-PII workload identifiers.

## Dependency and CI posture

The repository currently:

- uses a committed npm lockfile;
- uses `npm ci --ignore-scripts` in CI;
- fails CI on high-severity production dependency audit findings;
- runs tests on supported Node.js versions;
- pins GitHub Actions to commit SHAs;
- enables Dependabot version updates for npm and GitHub Actions;
- keeps the runtime dependency surface intentionally small;
- verifies the npm package shape with `npm pack --dry-run`.

The intended npm release path is Trusted Publishing/OIDC with provenance rather than a long-lived npm token stored in repository secrets.

## What AssumeKit does not currently do

- It does not provision or continuously audit IAM policies.
- It does not validate the effective permissions of the assumed role.
- It does not provide browser-side authentication.
- It does not provide a local static-key fallback.
- It does not protect a compromised Cloud Run process.
- It does not automatically provide application-level idempotency.
- It does not authorize request paths, methods, query strings, or payloads merely because the host is allowlisted.
- It does not currently support every AWS partition/provider combination; support should be treated as explicit, not inferred.

## Reporting vulnerabilities

Follow [SECURITY.md](../SECURITY.md). Do not include live tokens, credentials, customer payloads, or sensitive organization identifiers in a public issue.

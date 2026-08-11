# Security Policy

[日本語](SECURITY.ja.md)

AssumeKit is authentication infrastructure that handles workload identity federation and temporary AWS credentials. Vulnerability reports and troubleshooting must prioritize keeping credentials and production identifiers private.

## Reporting a vulnerability

Do not open a public issue containing:

- AWS access keys or secret access keys;
- Google ID tokens;
- AWS STS temporary credentials or session tokens;
- private keys or Google service-account key files;
- production AWS account IDs;
- private role ARNs;
- service-account email addresses or other environment identifiers that do not need to be public;
- customer data or PII; or
- actionable details for an unpatched vulnerability.

Use GitHub Private Vulnerability Reporting when it is available for this repository. If private reporting is unavailable, open only a minimal public issue asking for a private contact channel and include no sensitive technical details until a private channel is established.

## Security model

AssumeKit is designed around short-lived credentials obtained through workload identity federation. It does not require persistent AWS access keys or Google service-account key files.

Security still depends on:

- narrowly scoped AWS roles;
- restrictive IAM trust policies that pin the intended workload identity and audience;
- least-privilege permissions on the assumed role;
- keeping identity tokens and temporary credentials out of logs;
- avoiding PII in `sessionName`;
- maintaining dependency, GitHub Actions, and release-pipeline supply-chain controls; and
- protecting the execution environment from compromise, SSRF, and application-level authorization failures.

See [Security model](docs/security-model.md) for detailed boundaries and non-goals.

## Credential handling

Temporary AWS credentials are cached only in process memory by the library. AssumeKit does not persist them to files, databases, environment variables, or application configuration.

Google ID tokens are treated as short-lived credential-exchange values and are not intended for persistent storage.

## Network boundaries

- Google identity tokens are requested only from the Google metadata identity endpoint built into the GCP provider.
- Metadata requests reject redirects.
- The public API derives Regional AWS STS from the configured AWS region rather than accepting an arbitrary STS endpoint.
- AWS STS requests use HTTPS and reject redirects.
- Credential acquisition uses bounded timeouts and bounded retries.
- `createAwsFetch()` requires an exact HTTPS `allowedHosts` allowlist for signed AWS service requests.
- Signed AWS service requests reject redirects so a validated request cannot follow a redirect outside the allowlisted destination.
- Signed AWS service requests default to zero automatic retries to reduce accidental replay of non-idempotent operations.

The host allowlist does not authorize paths, methods, query strings, or payloads. Application-level authorization is still required.

## IAM trust policy

Do not trust `accounts.google.com` without conditions.

For the intended GCP → AWS flow, pin both the service account's stable numeric unique ID and the workload/role-specific audience. See [GCP → AWS trust policy](docs/gcp-aws-trust.md).

Do not remove `aud` / `oaud` / `sub` conditions merely to make an `AccessDenied` error disappear.

## Retry and request lifetime

Credential-acquisition retries and signed AWS service-call retries are separate:

- metadata / STS: bounded retries for transient failures;
- AWS service calls: default `0` retries.

If you enable `retries`, verify that replaying the operation is safe, especially for POST, MCP tool calls, and state-changing APIs.

AssumeKit does not impose a default timeout on every signed application request. Callers that need a service-call deadline should pass an `AbortSignal`, for example `AbortSignal.timeout(...)`. The release E2E uses a bounded smoke timeout.

## Logging

Never log:

- full Google ID tokens;
- AWS temporary access keys, secrets, or session tokens;
- Authorization headers or sensitive signed headers;
- private key material; or
- customer data.

Role ARNs and account IDs are not credentials by themselves, but production identifiers should still be omitted from public examples and issues unless disclosure is intentional.

## Supported versions

Until the first stable release, only the latest commit on `main` is considered supported. Security fixes may include breaking API changes while the package remains pre-1.0.

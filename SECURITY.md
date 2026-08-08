# Security Policy

[日本語](SECURITY.ja.md)

## Reporting a vulnerability

Do not open a public issue containing credentials, ID tokens, temporary AWS credentials, production account IDs, private role ARNs, customer information, or actionable exploit details.

Use GitHub private vulnerability reporting when it is available for this repository. If private reporting is unavailable, open only a minimal public issue asking for a private contact channel and include no sensitive technical details.

## Security model

AssumeKit is designed around short-lived credentials obtained through workload identity federation. It does not require persistent AWS access keys or Google service-account key files.

Security still depends on:

- a narrowly scoped AWS role;
- a restrictive IAM trust policy;
- validating the expected OIDC audience and workload identity;
- least-privilege permissions on the assumed role;
- keeping identity tokens and temporary credentials out of logs;
- keeping dependency and CI supply-chain controls current.

Temporary AWS credentials are cached only in process memory by the library.

## Network boundaries

- Google identity tokens are requested only from the Google metadata identity endpoint built into the GCP provider.
- The public API derives AWS STS from the configured AWS region rather than accepting an arbitrary STS endpoint.
- AWS STS requests use HTTPS.
- Credential acquisition uses bounded timeouts and retries.
- Signed AWS service requests default to zero automatic retries to reduce accidental replay of non-idempotent operations.

## Supported versions

Until the first stable release, only the latest commit on `main` is considered supported. Security fixes may include breaking API changes while the package remains pre-1.0.

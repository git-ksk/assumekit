# AssumeKit for AWS

**Keyless AWS access from external workload identities.**

AssumeKit is a lightweight TypeScript/Node.js library for workloads outside AWS that need to call SigV4-protected AWS HTTP endpoints without storing long-lived AWS access keys.

The first supported path is **Google Cloud Run → Google service-account ID token → AWS STS `AssumeRoleWithWebIdentity` → temporary credentials → constrained SigV4 `fetch()`**.

> Status: **early alpha**. The public API may change before v1.0, and the first npm release is blocked on a real Cloud Run → AWS end-to-end test.

AssumeKit is an independent open-source project and is not affiliated with or endorsed by Amazon Web Services. AWS and Amazon Web Services are trademarks of Amazon.com, Inc. or its affiliates.

[日本語 README](README.ja.md) · [Documentation](docs/README.md) · [Roadmap](docs/roadmap.md)

## Why

The Google → AWS workload-identity federation mechanism is standard. AssumeKit does **not** invent a new federation protocol.

Its value is composing the application-facing path that otherwise becomes repeated glue code:

1. request a short-lived workload identity token from the platform identity source;
2. exchange it through AWS STS `AssumeRoleWithWebIdentity`;
3. cache and refresh temporary AWS credentials safely;
4. constrain the destination and SigV4-sign HTTP requests;
5. keep identity tokens and temporary credentials out of logs and persistent storage.

The result is a small `fetch()`-style API with conservative defaults, without requiring a sidecar/proxy, static AWS keys, a Google service-account JSON key, or the full AWS SDK credential stack in the runtime API.

```text
Cloud Run service identity
        │
        ▼
Google metadata ID token
        │
        ▼
Regional AWS STS
AssumeRoleWithWebIdentity
        │
        ▼
Temporary AWS credentials
        │
        ▼
Constrained SigV4 fetch
```

## How this differs

| Approach | Good fit | AssumeKit difference |
| --- | --- | --- |
| Raw metadata + STS + SigV4 glue | Teams comfortable assembling and maintaining the flow themselves | Packages the whole path with credential lifecycle handling and conservative security defaults |
| AWS SDK credential-provider stack | Applications already centered on AWS SDK clients/providers | Keeps the public runtime surface focused on a lightweight SigV4 `fetch()` path |
| Static AWS keys / service-account key files | Legacy environments that cannot use workload identity | Intentionally unsupported; workload identity is the trust boundary |
| Sidecar/proxy credential brokers | Centralized process/network mediation is desired | Runs in-process and does not require another service or daemon |

AssumeKit is therefore a **thin cross-cloud workload-identity fetch layer**, not a general AWS authentication framework, secret manager, IAM provisioner, or AWS SDK replacement. See the [Roadmap and compatibility contract](docs/roadmap.md) for the boundaries that keep this scope defensible.

## Quick start

The cloud setup is intentionally explicit; AssumeKit does not auto-provision IAM.

1. Create a **dedicated user-managed Google service account** for the Cloud Run workload.
2. Get its **stable numeric `uniqueId`**.
3. Choose a workload-specific token **audience**.
4. Create an AWS IAM role whose **trust policy** pins the Google service-account identity and audience.
5. Attach a separate least-privilege **permissions policy** for the AWS API the workload needs.
6. Attach the Google service account to Cloud Run and configure `roleArn`, `region`, `service`, `audience`, and the allowed AWS request host.

For copy/paste setup commands, use [Cloud Run → AWS getting started](docs/getting-started.md).

> Trust policy and permissions policy are separate controls: the trust policy decides **who can assume the role**; the permissions policy decides **what the assumed role can do**.

## Installation

The package is **not published to npm yet**. The first npm release will follow the real Cloud Run → AWS release-gate E2E.

After release:

```bash
npm install assumekit
```

## Cloud Run example

```ts
import { createAwsFetch, gcpMetadataIdentity } from "assumekit";

const endpoint = new URL(process.env.AWS_ENDPOINT!);
const awsFetch = createAwsFetch({
  roleArn: process.env.AWS_ROLE_ARN!,
  region: process.env.AWS_REGION!,
  service: process.env.AWS_SERVICE!,
  identity: gcpMetadataIdentity({
    audience: process.env.AWS_OIDC_AUDIENCE!,
  }),
  allowedHosts: [endpoint.host],
});

const response = await awsFetch(endpoint);
```

Example non-secret configuration:

```dotenv
AWS_ROLE_ARN=arn:aws:iam::<AWS_ACCOUNT_ID>:role/AssumeKitExample
AWS_REGION=ap-northeast-1
AWS_SERVICE=execute-api
AWS_OIDC_AUDIENCE=assumekit-prod-example
AWS_ENDPOINT=https://example.execute-api.ap-northeast-1.amazonaws.com/health
```

No `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, Google service-account private-key file, or manually stored Google ID token is required.

`service` is the AWS **SigV4 signing name**, which is not always the same as the product name. API Gateway IAM authorization uses `execute-api`; confirm the signing name for other services in AWS documentation.

`allowedHosts` is an exact allowlist for signed request destinations. It accepts host names with an optional port, not schemes or paths. Deriving it from a trusted configured `AWS_ENDPOINT` avoids allowing untrusted request destinations.

Signed AWS service requests reject redirects even if the caller asks to follow them. Configure the final canonical HTTPS endpoint directly. Application service calls do not receive one global library timeout; pass an `AbortSignal`, such as `AbortSignal.timeout(...)`, when an operation needs a deadline.

## Documentation

| Topic | English | 日本語 |
| --- | --- | --- |
| Roadmap / compatibility contract | [Roadmap](docs/roadmap.md) | [Roadmap](docs/roadmap.ja.md) |
| End-to-end configuration | [Getting started](docs/getting-started.md) | [セットアップガイド](docs/getting-started.ja.md) |
| Release-blocking real-cloud E2E | [Cloud Run E2E runbook](docs/cloud-run-e2e.md) | [Cloud Run E2E runbook](docs/cloud-run-e2e.ja.md) |
| Google → AWS IAM trust | [Trust policy](docs/gcp-aws-trust.md) | [Trust policy](docs/gcp-aws-trust.ja.md) |
| Errors and diagnosis | [Troubleshooting](docs/troubleshooting.md) | [トラブルシューティング](docs/troubleshooting.ja.md) |
| Threats / boundaries / non-goals | [Security model](docs/security-model.md) | [セキュリティモデル](docs/security-model.ja.md) |
| Vulnerability reporting | [Security policy](SECURITY.md) | [セキュリティポリシー](SECURITY.ja.md) |
| Contributing | [Contributing](CONTRIBUTING.md) | [Contributing](CONTRIBUTING.ja.md) |

## Security defaults

- **Regional STS** — derives the Regional AWS STS endpoint from `region`.
- **No arbitrary STS endpoint in the public API** — normal configuration cannot post the workload token to a caller-supplied STS host.
- **No redirect following for identity exchange** — GCP metadata and STS requests reject redirects.
- **Explicit signed-host allowlist** — every signed service request must use HTTPS and exactly match `allowedHosts`.
- **No signed service redirects** — service requests force redirect rejection after the allowlist check.
- **Short credential timeouts** — GCP metadata defaults to 3 seconds per attempt; STS defaults to 10 seconds per attempt.
- **Credential-only retries** — metadata and STS transient failures use bounded full-jitter retry.
- **No implicit service-call retries** — signed AWS requests default to `retries: 0`.
- **In-memory credentials only** — temporary credentials are not persisted by the library.
- **Single-flight refresh** — concurrent requests share an in-flight credential refresh.
- **Metadata path validation** — unsafe GCP service-account path segments are rejected.

Credential retries and AWS service-call retries are deliberately separate. Opt into service-call retries only when replay is safe, and use a caller-provided `AbortSignal` when a service call needs a deadline.

## Configuration

### `createAwsFetch()`

| Option | Required | Default | Purpose |
| --- | --- | --- | --- |
| `roleArn` | yes | — | AWS IAM role to assume |
| `region` | yes | — | Target AWS region and STS region |
| `service` | yes | — | SigV4 signing service name, such as `execute-api` |
| `identity` | yes | — | Workload identity provider |
| `allowedHosts` | yes | — | Exact HTTPS hosts allowed for signed service requests |
| `sessionName` | no | generated | STS role session name; avoid PII |
| `durationSeconds` | no | AWS default | 900–43200, subject to the IAM role maximum |
| `refreshBeforeMs` | no | 300000 | Refresh temporary credentials before expiry |
| `stsTimeoutMs` | no | 10000 | STS timeout per attempt |
| `stsMaxRetries` | no | 2 | STS transient retries |
| `stsRetryBaseMs` | no | 100 | Initial full-jitter retry window |
| `retries` | no | 0 | Signed AWS service-call retries |

### `gcpMetadataIdentity()`

| Option | Required | Default | Purpose |
| --- | --- | --- | --- |
| `audience` | yes | — | Google ID-token audience; must match AWS trust policy `oaud` |
| `serviceAccount` | no | `default` | Metadata service-account path segment |
| `timeoutMs` | no | 3000 | Metadata timeout per attempt |
| `maxRetries` | no | 2 | Transient metadata retries |
| `retryBaseMs` | no | 50 | Initial full-jitter retry window |

## IAM setup rules of thumb

- Use a dedicated Cloud Run service account where practical.
- Use the service account's **numeric unique ID** in the AWS Google-federation identity conditions rather than its email as the primary stable identifier.
- Keep the audience workload/role-specific and match it exactly between Google token acquisition and the AWS trust policy.
- Do not remove `aud` / `oaud` / `sub` restrictions merely to fix STS `AccessDenied`.
- Keep the assumed role's AWS permissions separate and least-privilege.
- Do not put human names, email addresses, or customer identifiers into `sessionName`; identity/session fields can appear in CloudTrail.

See [GCP → AWS trust policy](docs/gcp-aws-trust.md) for the full mapping.

## Scope for v0.1

Included:

- Google Cloud metadata-server service-account ID tokens;
- AWS `AssumeRoleWithWebIdentity` through Regional STS;
- in-memory temporary credential caching and early refresh;
- concurrent refresh de-duplication;
- bounded timeout/retry behavior for credential acquisition;
- explicit HTTPS signed-request host allowlisting;
- redirect rejection for signed service requests;
- SigV4 `fetch()` wrapper;
- Node.js 22+ / TypeScript.

Not included:

- persistent credential storage;
- static AWS access-key authentication;
- Google service-account JSON-key fallback;
- local AWS profiles or AWS IAM Identity Center;
- proxy/daemon mode;
- automatic IAM provisioning;
- generic secret management;
- browser support;
- one global timeout for all signed application service calls;
- automatic retry of non-idempotent AWS requests;
- implicit support for every cloud/provider/AWS partition combination.

For endpoint compatibility, provider requirements, and post-v0.1 direction, see the [Roadmap](docs/roadmap.md). The intended evolution is to generalize the **workload identity provider** behind the existing interface, not to turn the AWS-facing API into a broad SDK abstraction.

## Local development

`gcpMetadataIdentity()` relies on the Google metadata server and therefore does not work on a normal local laptop. For unit tests, inject a test `WorkloadIdentityProvider`; do not add a production long-lived-key fallback merely to simulate Cloud Run.

The repository includes `npm run e2e:cloud-run` for the release-blocking real-cloud smoke test. Follow the [Cloud Run E2E runbook](docs/cloud-run-e2e.md), which pins the buildpack runtime, uses the configured `AWS_ENDPOINT` host as the signed-request allowlist, rejects redirects, and bounds the final smoke request.

## Security

AssumeKit is authentication infrastructure. Read the [Security model](docs/security-model.md) before production use.

Never commit or paste live tokens, temporary credentials, private keys, customer data, or PII into examples or public issues. See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Contributing

Issues and focused pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT

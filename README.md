# AssumeKit for AWS

**Keyless AWS access from external workload identities.**

AssumeKit is a lightweight TypeScript/Node.js library for workloads outside AWS that need to call SigV4-protected AWS HTTP endpoints without storing long-lived AWS access keys.

The first supported path is **Google Cloud Run → Google service-account ID token → AWS STS `AssumeRoleWithWebIdentity` → temporary credentials → SigV4 `fetch()`**.

> Status: **early alpha**. The public API may change before v1.0, and the first npm release is blocked on a real Cloud Run → AWS end-to-end test.

AssumeKit is an independent open-source project and is not affiliated with or endorsed by Amazon Web Services. AWS and Amazon Web Services are trademarks of Amazon.com, Inc. or its affiliates.

[日本語 README](README.ja.md) · [Documentation](docs/README.md)

## Why

The federation mechanism is standard, but application code still has to glue together several steps:

1. request a Google service-account ID token from the metadata server;
2. exchange it with AWS STS using `AssumeRoleWithWebIdentity`;
3. cache and refresh temporary AWS credentials;
4. SigV4-sign each AWS HTTP request;
5. keep identity tokens and temporary credentials out of logs and persistent storage.

AssumeKit packages that flow into a `fetch()`-style API without requiring a sidecar, proxy process, AWS CLI, Google auth SDK, or the full AWS SDK credential stack in the runtime.

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
SigV4 fetch
        │
        ├── AWS MCP endpoints
        ├── API Gateway IAM auth
        ├── OpenSearch
        └── other SigV4 HTTP endpoints
```

## Quick start

The cloud setup is intentionally explicit; AssumeKit does not auto-provision IAM.

1. Create a **dedicated user-managed Google service account** for the Cloud Run workload.
2. Get its **stable numeric `uniqueId`**.
3. Choose a workload-specific token **audience**.
4. Create an AWS IAM role whose **trust policy** pins the Google service-account identity and audience.
5. Attach a separate least-privilege **permissions policy** for the AWS API the workload needs.
6. Attach the Google service account to Cloud Run and configure `roleArn`, `region`, `service`, and `audience` in the application.

For copy/paste `gcloud` and AWS CLI examples, start with **[Cloud Run → AWS getting started](docs/getting-started.md)**.

> Trust policy and permissions policy are different security controls: the trust policy decides **who can assume the role**; the permissions policy decides **what the assumed role can do**.

## Installation

The package is **not published to npm yet**. The first npm release will follow a real Cloud Run → AWS end-to-end test.

After release:

```bash
npm install assumekit
```

## Cloud Run example

```ts
import { createAwsFetch, gcpMetadataIdentity } from "assumekit";

const awsFetch = createAwsFetch({
  roleArn: process.env.AWS_ROLE_ARN!,
  region: process.env.AWS_REGION!,
  service: process.env.AWS_SERVICE!,
  identity: gcpMetadataIdentity({
    audience: process.env.AWS_OIDC_AUDIENCE!,
  }),
});

const response = await awsFetch(process.env.AWS_ENDPOINT!);
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

## Documentation

| Topic | English | 日本語 |
| --- | --- | --- |
| End-to-end configuration | [Getting started](docs/getting-started.md) | [セットアップガイド](docs/getting-started.ja.md) |
| Google → AWS IAM trust | [Trust policy](docs/gcp-aws-trust.md) | [Trust policy](docs/gcp-aws-trust.ja.md) |
| Errors and diagnosis | [Troubleshooting](docs/troubleshooting.md) | [トラブルシューティング](docs/troubleshooting.ja.md) |
| Threats / boundaries / non-goals | [Security model](docs/security-model.md) | [セキュリティモデル](docs/security-model.ja.md) |

## Security defaults

- **Regional STS** — derives the Regional AWS STS endpoint from `region` instead of accepting a legacy/global default.
- **No arbitrary STS endpoint in the public API** — normal configuration cannot post the workload ID token to a caller-supplied STS host.
- **No redirect following for identity exchange** — GCP metadata and STS requests use redirect rejection.
- **Short timeouts** — GCP metadata requests default to 3 seconds per attempt; STS requests default to 10 seconds per attempt.
- **Credential-only retries** — metadata and STS transient failures retry a limited number of times with exponential full jitter.
- **No implicit service-call retries** — signed AWS requests default to `retries: 0`, avoiding accidental replay of non-idempotent MCP/API calls.
- **In-memory credentials only** — temporary AWS credentials are never persisted by the library.
- **Single-flight refresh** — concurrent requests share an in-flight credential refresh.
- **Metadata path validation** — unsafe GCP service-account path segments are rejected.

Credential retries and AWS service-call retries are deliberately separate. You can opt into service-call retries with `retries`, but only do so when replaying the target request is safe.

## Configuration

### `createAwsFetch()`

| Option | Required | Default | Purpose |
| --- | --- | --- | --- |
| `roleArn` | yes | — | AWS IAM role to assume |
| `region` | yes | — | Target AWS region and STS region |
| `service` | yes | — | SigV4 signing service name, such as `execute-api` |
| `identity` | yes | — | Workload identity provider |
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
- Do not remove `aud` / `oaud` / `sub` restrictions just to fix STS `AccessDenied`.
- Keep the assumed role's AWS permissions separate and least-privilege.
- Do not put human names, email addresses, or customer identifiers into `sessionName`; identity/session fields can appear in CloudTrail.

See [docs/gcp-aws-trust.md](docs/gcp-aws-trust.md) for the full policy mapping.

## Scope for v0.1

Included:

- Google Cloud metadata-server service-account ID tokens;
- AWS `AssumeRoleWithWebIdentity` through Regional STS;
- in-memory temporary credential caching and early refresh;
- concurrent refresh de-duplication;
- bounded timeout/retry behavior for credential acquisition;
- SigV4 `fetch()` wrapper;
- Node.js 22+ / TypeScript.

Not included yet:

- persistent credential storage;
- static AWS access-key authentication;
- local AWS profiles or AWS IAM Identity Center;
- proxy/daemon mode;
- automatic IAM provisioning;
- browser support;
- automatic retry of non-idempotent AWS requests;
- implicit support for every cloud/provider/AWS partition combination.

The provider interface is intentionally small so other OIDC workload sources such as GitHub Actions, Azure, and Kubernetes can be added later without changing the AWS-facing API.

## Local development

`gcpMetadataIdentity()` intentionally relies on the Google metadata server and therefore does not work on a normal local laptop. For unit tests, inject a test `WorkloadIdentityProvider`; do not add a production long-lived-key fallback merely to simulate Cloud Run.

## Security

AssumeKit is authentication infrastructure. Treat IAM trust policies as part of the security boundary and read the [security model](docs/security-model.md) before production use.

Never commit or paste live tokens, temporary credentials, private keys, customer data, or PII into examples or public issues.

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Contributing

Issues and focused pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT

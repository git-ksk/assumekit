# AssumeKit for AWS

**Keyless AWS access from external workload identities.**

AssumeKit is a lightweight TypeScript/Node.js library for workloads outside AWS that need to call SigV4-protected AWS HTTP endpoints without storing long-lived AWS access keys.

The first supported path is **Google Cloud Run → Google service-account ID token → AWS STS `AssumeRoleWithWebIdentity` → temporary credentials → SigV4 `fetch()`**.

> Status: **early alpha**. The public API may change before v1.0.

AssumeKit is an independent open-source project and is not affiliated with or endorsed by Amazon Web Services. AWS and Amazon Web Services are trademarks of Amazon.com, Inc. or its affiliates.

[日本語 README](README.ja.md)

## Why

The underlying federation flow is standard, but application code still has to glue together several steps:

1. request a Google service-account ID token from the metadata server;
2. exchange it with AWS STS using `AssumeRoleWithWebIdentity`;
3. cache and refresh temporary AWS credentials;
4. SigV4-sign each AWS HTTP request;
5. avoid leaking tokens and long-lived credentials along the way.

AssumeKit packages that flow into a `fetch()`-style API without requiring a sidecar, proxy process, AWS CLI, Google auth SDK, or the full AWS SDK credential stack.

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
        ├── AgentCore
        ├── OpenSearch
        └── other SigV4 HTTP endpoints
```

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
  region: "ap-northeast-1",
  service: "execute-api",
  identity: gcpMetadataIdentity({
    audience: "assumekit",
  }),
});

const response = await awsFetch(
  "https://example.execute-api.ap-northeast-1.amazonaws.com/health",
);
```

No `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, or service-account key file is required.

## Security defaults

- **Regional STS** — AssumeKit derives the Regional AWS STS endpoint from `region` instead of using the legacy global endpoint.
- **No arbitrary STS endpoint in the public API** — the workload identity token is not configurable to be posted to an arbitrary host.
- **Short timeouts** — GCP metadata requests default to 3 seconds per attempt; STS requests default to 10 seconds per attempt.
- **Credential-only retries** — metadata and STS transient failures retry a limited number of times with exponential full jitter.
- **No implicit service-call retries** — signed AWS requests default to `retries: 0`, avoiding accidental replay of non-idempotent MCP/API calls.
- **In-memory credentials only** — temporary AWS credentials are never persisted by the library.
- **Single-flight refresh** — concurrent requests share an in-flight credential refresh.

Credential retries and AWS service-call retries are deliberately separate. You can opt into service-call retries with `retries`, but only do so when replaying the target request is safe.

## Configuration

### `createAwsFetch()`

| Option | Required | Default | Purpose |
| --- | --- | --- | --- |
| `roleArn` | yes | — | AWS IAM role to assume |
| `region` | yes | — | Target AWS region and default STS region |
| `service` | yes | — | SigV4 service name, such as `execute-api` |
| `identity` | yes | — | Workload identity provider |
| `sessionName` | no | generated | STS role session name |
| `durationSeconds` | no | AWS default | 900–43200, subject to role maximum |
| `refreshBeforeMs` | no | 300000 | Refresh temporary credentials before expiry |
| `stsTimeoutMs` | no | 10000 | STS timeout per attempt |
| `stsMaxRetries` | no | 2 | STS transient retries |
| `stsRetryBaseMs` | no | 100 | Initial full-jitter retry window |
| `retries` | no | 0 | Signed AWS service-call retries |

### `gcpMetadataIdentity()`

| Option | Required | Default | Purpose |
| --- | --- | --- | --- |
| `audience` | yes | — | Google ID-token audience; must match the AWS trust policy |
| `serviceAccount` | no | `default` | Metadata service-account path segment |
| `timeoutMs` | no | 3000 | Metadata timeout per attempt |
| `maxRetries` | no | 2 | Transient metadata retries |
| `retryBaseMs` | no | 50 | Initial full-jitter retry window |

## AWS trust policy

The AWS role must restrict which Google workload can assume it. For Google service-account ID tokens, use the stable service-account unique ID plus the expected token audience rather than trusting all tokens from `accounts.google.com`.

See [docs/gcp-aws-trust.md](docs/gcp-aws-trust.md).

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
- automatic retry of non-idempotent AWS requests.

The provider interface is intentionally small so other OIDC workload sources such as GitHub Actions, Azure, and Kubernetes can be added later without changing the AWS-facing API.

## Security

AssumeKit is authentication infrastructure. Treat IAM trust policies as part of the security boundary. Never commit tokens, production account IDs, private role ARNs, service-account emails, or customer data to examples or public issues.

See [SECURITY.md](SECURITY.md).

## Contributing

Issues and focused pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT

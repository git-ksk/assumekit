# AWS AssumeKit

**Lightweight, keyless AWS access from external workload identities.**

AWS AssumeKit lets workloads outside AWS obtain short-lived AWS credentials through OIDC federation and make SigV4-signed HTTP requests without static AWS access keys, sidecars, proxy processes, the AWS CLI, or a full AWS SDK credential stack.

> Status: **early alpha**. The first target is Google Cloud Run → AWS. The public API may change before v1.0.

AWS AssumeKit is an independent open-source project and is not affiliated with or endorsed by Amazon Web Services. AWS and Amazon Web Services are trademarks of Amazon.com, Inc. or its affiliates.

## Why

Calling a SigV4-protected AWS endpoint from Cloud Run often turns a simple HTTP call into several pieces of infrastructure:

1. obtain a Google workload identity token;
2. exchange it with AWS STS using `AssumeRoleWithWebIdentity`;
3. cache and refresh temporary AWS credentials;
4. SigV4-sign each request;
5. avoid long-lived AWS keys in Cloud Run.

AWS AssumeKit packages that flow into a normal `fetch()`-style API.

```text
Cloud Run service identity
        │
        ▼
Google metadata ID token
        │
        ▼
AWS STS AssumeRoleWithWebIdentity
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

## Install

The npm package is **not published yet**. The first npm release will follow end-to-end validation against a real Cloud Run → AWS setup.

For development, clone this repository and run:

```bash
npm install
npm run typecheck
npm test
npm run build
```

## Cloud Run example

```ts
import { createAwsFetch, gcpMetadataIdentity } from "aws-assumekit";

const awsFetch = createAwsFetch({
  roleArn: process.env.AWS_ROLE_ARN!,
  region: "us-east-1",
  service: "execute-api",
  identity: gcpMetadataIdentity({
    audience: "aws-assumekit",
  }),
});

const response = await awsFetch(
  "https://example.execute-api.us-east-1.amazonaws.com/health",
);
```

No `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` is required.

## Design goals

- **Keyless by default** — use workload identity and temporary AWS credentials.
- **No sidecar or proxy process** — import the library into an existing Node.js service.
- **Small dependency surface** — use platform `fetch()` and a focused SigV4 implementation.
- **Provider-neutral core** — GCP first; GitHub Actions, Azure, Kubernetes OIDC and other providers can follow.
- **MCP-friendly, not MCP-only** — AWS MCP is a first-class use case, but the core works with ordinary SigV4 HTTP endpoints.
- **Safe caching** — temporary credentials are held in memory and refreshed before expiration.
- **No implicit retries** — signed HTTP retries default to `0`, avoiding accidental replay of non-idempotent MCP/API calls; opt in with `retries` when appropriate.

## AWS trust policy

The AWS role must trust the external OIDC identity and restrict which workloads may assume it. For GCP, validate claims such as audience and subject rather than trusting every token from the provider.

See [docs/gcp-aws-trust.md](docs/gcp-aws-trust.md).

## Scope for v0.1

Included:

- Google Cloud metadata-server ID tokens;
- AWS `AssumeRoleWithWebIdentity`;
- in-memory temporary credential caching and refresh;
- SigV4 `fetch()` wrapper;
- Node.js 20+ / TypeScript.

Not included yet:

- persistent credential storage;
- AWS access-key authentication;
- local AWS profiles or AWS SSO;
- proxy/daemon mode;
- automatic IAM provisioning;
- browser support.

## Security

AWS AssumeKit is authentication infrastructure. Treat IAM trust policies as part of the security boundary. Do not commit credentials, tokens, production account IDs, or real role ARNs to examples or bug reports.

See [SECURITY.md](SECURITY.md).

## Contributing

Issues and focused pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT

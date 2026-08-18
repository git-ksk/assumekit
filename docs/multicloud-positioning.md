# Multi-cloud product positioning

AssumeKit is a thin **multi-cloud workload identity → constrained AWS access bridge**.

It is designed for production workloads that run outside AWS but need to call SigV4-protected AWS endpoints without distributing long-lived AWS access keys or cloud-provider private-key files.

The stable product shape is:

```text
external workload identity
  → AWS STS AssumeRoleWithWebIdentity
  → temporary AWS credentials
  → constrained SigV4 fetch
```

AssumeKit does not invent a federation protocol. Its value is reducing the identity-acquisition, credential-lifecycle, and request-boundary glue that remains around standard federation primitives.

## Cloud Run is the first reference path, not the permanent boundary

The first production-supported path is Google Cloud Run → AWS because it is a useful, concrete cross-cloud workload and still requires application-side composition across:

- Google runtime identity acquisition;
- AWS STS `AssumeRoleWithWebIdentity`;
- temporary credential caching and refresh;
- SigV4 request signing;
- request-destination constraints;
- redirect, retry, timeout, and logging safety.

Finishing this path completely provides the first real-cloud reference implementation for the broader architecture.

AssumeKit should not claim support for additional identity providers until each provider has its own real-cloud evidence.

## What AssumeKit is not

AssumeKit is intentionally not:

- an AWS SDK replacement;
- an AWS service client framework;
- a generic multi-source credential chain;
- a static access-key compatibility layer;
- a cloud secret manager;
- an IAM role/policy provisioner;
- a provider-count-driven federation framework;
- a sidecar or credential-broker daemon.

The goal is not to provide more kinds of AWS credentials. The goal is to avoid distributing long-lived AWS credentials where the workload platform already provides a usable short-lived identity.

## Stable architecture boundary

The generalization axis is the **workload identity source**.

The AWS-facing contract should remain narrow:

```ts
createAwsFetch({
  identity,
  roleArn,
  region,
  service,
  allowedHosts,
});
```

A future provider may change how `identity` is acquired, but should not widen the AWS-facing API into a broad credential or service-client abstraction.

Conceptually:

```text
Google Cloud Run identity ─┐
Azure workload identity ───┼─> WorkloadIdentityProvider
Kubernetes identity ────────┤
other qualified identity ───┘
                              ↓
                    AWS STS web identity
                              ↓
                     temporary credentials
                              ↓
                    constrained SigV4 fetch
```

## Security properties are product properties

The following are part of the product boundary, not incidental implementation details:

- Regional AWS STS;
- no arbitrary caller-supplied STS endpoint in the normal public API;
- short-lived identity and temporary AWS credentials;
- no credential persistence;
- bounded identity/STS acquisition;
- safe redirect behavior;
- exact signed-host allowlisting;
- zero default AWS service-call retries;
- safe errors and logs;
- provider-specific real-cloud evidence before support claims.

A new provider that cannot preserve these properties should not be added merely to increase platform coverage.

## Competitive boundary

AssumeKit should not enter a provider lane solely because federation is technically possible.

Before adding a provider, compare it with the platform's mature first-party or official AWS integration.

A provider is worth pursuing only when a meaningful gap remains in at least one of these areas:

- fetch-native integration;
- runtime identity acquisition;
- temporary credential lifecycle;
- security-boundary enforcement;
- conservative request behavior;
- application-side glue that would otherwise be repeatedly reimplemented.

If an official integration already solves the production workload end to end, AssumeKit should defer unless a specific unmet runtime use case is demonstrated.

GitHub Actions OIDC is the canonical example: GitHub → AWS already has mature first-party integration, so it is not a default expansion target.

## Provider selection policy

Post-v0.1 provider work is demand- and gap-driven, not checklist-driven.

A candidate must satisfy all of the following before implementation starts:

1. A concrete production workload outside AWS needs AWS access.
2. The platform exposes a short-lived workload identity without requiring a long-lived private key.
3. The first-party/official AWS integration has been reviewed.
4. A meaningful integration or security gap remains.
5. AssumeKit can close that gap without becoming a generic credential chain.
6. Identity acquisition can use a fixed or tightly constrained source.
7. Failure handling can remain bounded and safe.
8. A real-cloud E2E environment is available.
9. The target use case fits ordinary request/response SigV4 fetch semantics.

Issue #16 tracks this decision framework. Issue #18 tracks the post-v0.1 candidate comparison.

## Candidate lanes after v0.1

Research candidates include:

- Azure workload identity / managed identity → AWS;
- Kubernetes projected service-account identity → AWS;
- edge runtimes such as Cloudflare Workers, but only where a suitable short-lived workload identity path actually exists and can satisfy the provider contract.

These are candidates, not commitments.

The next provider should be selected only after the Cloud Run path is proven and the first npm alpha is published.

## Immediate priority

The multi-cloud position does **not** widen v0.1.

The current sequence remains:

1. Complete #5 real Cloud Run → AWS release-gate E2E.
2. Publish the first npm alpha using the existing release process.
3. Record Cloud Run → AWS as the first reference implementation.
4. Evaluate post-v0.1 provider candidates using #16 and #18.
5. Pick at most one next provider.
6. Require provider-specific real-cloud evidence before claiming production support.

## Product statement

A concise description of the intended product is:

> Bring the workload identity your platform already gives you; AssumeKit exchanges it for short-lived AWS access and exposes a constrained SigV4 `fetch()` path — without distributing long-lived AWS keys.

A shorter framing is:

> Multi-cloud workload identity in. Temporary, constrained AWS access out.

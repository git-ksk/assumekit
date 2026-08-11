# Roadmap and compatibility contract

AssumeKit is intentionally narrow. It is not a new federation protocol, an IAM provisioner, a secret manager, or a replacement for every AWS SDK credential provider.

Its application-facing role is:

```text
external workload identity
  → AWS STS AssumeRoleWithWebIdentity
  → temporary AWS credentials
  → constrained SigV4 fetch
```

The underlying federation mechanisms are standard. AssumeKit's value is composing that path into a small fetch-oriented API with conservative defaults, credential lifecycle handling, and an explicit security boundary.

## v0.1: finish one path completely

The first release remains focused on Google Cloud Run → AWS.

Release requirements:

- pass and record the real Cloud Run → AWS release-gate E2E tracked in #5;
- publish the first npm alpha only after that gate passes;
- keep Google metadata identity as the only production identity provider in v0.1;
- keep Regional STS, exact signed-host allowlisting, redirect rejection, bounded credential acquisition, and zero default service-call retries as compatibility/security properties;
- keep static keys, IAM auto-provisioning, persistent credential storage, browser auth, and proxy/daemon mode out of v0.1.

## Supported SigV4 endpoint classes

AssumeKit is intended for HTTPS endpoints that use ordinary AWS SigV4 request signing and can be addressed with a stable final host, including examples such as:

- API Gateway IAM-authorized endpoints (`service: "execute-api"`);
- AWS service HTTP endpoints where SigV4 is the documented authentication mechanism and the signing name/region are known;
- MCP or application HTTP endpoints fronted by an AWS service that expects SigV4 authentication.

Compatibility is **not inferred from the AWS product name**. The caller must provide the correct SigV4 signing `service` and `region`, and the final HTTPS host must be listed in `allowedHosts`.

Known caveats:

- the SigV4 signing name can differ from the AWS product name;
- redirects are rejected, so configure the final canonical endpoint directly;
- host allowlisting does not authorize paths, methods, query strings, or payloads;
- service-specific streaming, event-stream, WebSocket, presigning, or nonstandard signing flows are not automatically covered by the generic `fetch()` contract;
- AWS partition/provider combinations are supported only when explicitly documented and tested, not by assumption.

If a service requires behavior outside ordinary request/response SigV4 fetch semantics, treat it as unsupported until a focused test and documentation change establishes compatibility.

## Workload identity provider contract

Additional identity providers may be implemented behind `WorkloadIdentityProvider`, but a provider is not considered production-supported merely because it can return a token.

A production provider must satisfy this contract:

1. **Short-lived workload identity** — obtain a runtime identity token/credential from the platform's workload identity mechanism rather than requiring a long-lived private key or static cloud secret.
2. **Explicit audience / trust target** — make the intended federation audience or equivalent trust target explicit where the platform supports it.
3. **Fixed or tightly constrained credential source** — do not allow untrusted application input to select an arbitrary identity-token endpoint.
4. **No unsafe redirects** — credential-bearing network requests must not silently follow redirects to a different destination.
5. **Bounded acquisition** — use finite timeouts and bounded retries only for appropriate transient failures.
6. **No credential persistence** — do not persist identity tokens or exchanged AWS temporary credentials as a provider convenience.
7. **Safe errors/logging** — never include live tokens, private keys, temporary credentials, or Authorization headers in normal errors/logs.
8. **Testable failure modes** — include tests for malformed configuration, unavailable identity endpoints, retry limits, and recovery after transient failure.
9. **Real-cloud evidence before support claims** — add provider-specific E2E evidence before documenting the provider as production-supported.

The AWS-facing `createAwsFetch()` contract should remain stable as identity sources are generalized.

## Post-v0.1 provider direction

Generalize the **identity source**, not the AWS-facing API. Add providers only when there is a real use case and a credible E2E environment.

Tentative order:

1. GitHub Actions OIDC;
2. Azure workload identity / managed identity where it can satisfy the provider contract cleanly;
3. Kubernetes projected service-account tokens / workload identity;
4. other providers only with equivalent security properties and real E2E evidence.

This ordering is directional, not a promise of release dates.

## Explicit non-goals

AssumeKit should not grow into:

- a static AWS access-key fallback;
- a Google service-account JSON-key loader;
- an IAM role/policy provisioner;
- a generic secret manager;
- persistent credential storage;
- a browser credential library;
- a broad replacement for AWS SDK service clients;
- a sidecar/proxy/daemon unless the project scope is deliberately reconsidered first.

Large changes to these boundaries should start with an issue and threat-model discussion rather than an implementation PR.

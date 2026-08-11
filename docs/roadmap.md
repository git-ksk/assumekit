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
- keep the public API intentionally small until real Cloud Run dogfood proves the path;
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

## Post-v0.1: expand only when there is a demonstrated gap

Do **not** use provider count as a roadmap metric. A new identity provider should be added only when there is a concrete fetch-native use case where existing official or provider-native integrations leave meaningful glue, lifecycle, or security-boundary work that AssumeKit can reduce.

Before prioritizing a provider, require:

1. a documented user/workload need;
2. a comparison with the mature first-party or official integration for that platform;
3. a clear explanation of the gap AssumeKit closes without becoming a generic credential chain;
4. an implementation that satisfies the provider contract above; and
5. a credible real-cloud E2E environment before production-support claims.

Azure workload identity, Kubernetes projected service-account tokens, or other workload identities may be candidates when they satisfy those criteria. **GitHub Actions OIDC is not the automatic next target**: GitHub → AWS already has mature official integrations, so AssumeKit should add a GitHub provider only if a specific fetch-native gap is demonstrated that those integrations do not address.

Prefer demand-driven provider expansion over a fixed provider checklist. Generalize the **identity source**, not the AWS-facing API.

## Explicit non-goals

AssumeKit should not grow into:

- a static AWS access-key fallback;
- a Google service-account JSON-key loader;
- a generic multi-source credential chain;
- an IAM role/policy provisioner;
- a generic secret manager;
- persistent credential storage;
- a browser credential library;
- a broad replacement for AWS SDK service clients;
- a sidecar/proxy/daemon unless the project scope is deliberately reconsidered first.

Large changes to these boundaries should start with an issue and threat-model discussion rather than an implementation PR.

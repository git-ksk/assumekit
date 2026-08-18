# Competitive boundary: IAM Roles Anywhere and native workload identity

AssumeKit should not try to replace AWS IAM Roles Anywhere, Vault, SPIFFE/SPIRE, or other existing credential infrastructure where those systems are already the right fit.

Its strongest product lane is narrower:

> Production workloads already running on a platform with a native short-lived workload identity, which need constrained AWS access without distributing long-lived AWS keys or introducing a second credential substrate only for AWS.

## Where IAM Roles Anywhere is stronger

Prefer IAM Roles Anywhere when the environment already has, or explicitly wants, an X.509 / PKI identity model. Examples include:

- on-premises servers and appliances;
- workloads backed by enterprise PKI;
- certificate/private-key lifecycle managed through HSM, TPM, PKCS#11, or equivalent controls;
- environments that need broad AWS CLI / SDK credential compatibility rather than a narrow application `fetch()` path.

AssumeKit should not claim superiority in these cases.

## Where AssumeKit should win

AssumeKit is intended for workloads where the platform already provides a usable workload identity, such as cloud-native runtime identity or a projected short-lived token.

In that lane, the goal is to avoid introducing another credential system just to call AWS:

```text
platform-native workload identity
  → AWS STS AssumeRoleWithWebIdentity
  → temporary AWS credentials
  → constrained SigV4 fetch
```

The differentiator is not merely obtaining temporary AWS credentials. It is composing identity acquisition, exchange, lifecycle, and conservative request boundaries into one application-facing path.

## Product rule

Do not expand provider support simply because federation is possible.

A provider should be added only when AssumeKit removes meaningful application-side glue or security-boundary work that a mature official integration does not already remove.

If a workload already has a strong first-party route to AWS, defer that lane unless a concrete fetch-native/runtime gap remains.

## GCP-first expansion rule

Before implementing a second cloud provider, expand and validate the existing GCP metadata provider across additional compatible GCP runtimes where the same identity mechanism applies.

Candidate runtime validation lanes include:

- Cloud Run;
- Compute Engine;
- GKE environments that expose the intended metadata identity path;
- Cloud Build where applicable;
- Cloud Run functions / related managed runtimes where applicable.

Each runtime must have its own real-cloud evidence before being documented as production-supported. Shared implementation does not imply shared support.

This sequence is preferred because it broadens real-world coverage without increasing provider count or widening the AWS-facing API.

## Post-GCP provider selection

Only after the Cloud Run release gate, first npm alpha, and GCP runtime coverage evaluation should the project choose at most one additional provider lane.

Candidates may include Azure workload identity / managed identity, Kubernetes projected service-account identity, or edge runtimes with a defensible short-lived workload identity path.

Use the provider acceptance criteria in issue #16 and the research matrix in issue #18 before implementation.

## Decision summary

AssumeKit competes on this boundary:

> Use the identity your platform already gives the workload. Exchange it for short-lived AWS access. Keep the AWS-facing request path constrained. Do not add long-lived AWS keys, and do not introduce PKI or a credential broker when the workload already has a suitable native identity.

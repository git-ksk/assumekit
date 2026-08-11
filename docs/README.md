# AssumeKit documentation

[日本語ドキュメント](README.ja.md)

AssumeKit is currently focused on **Google Cloud Run → Google service-account ID token → AWS STS → temporary AWS credentials → constrained SigV4 HTTP requests**.

The underlying federation mechanism is standard. AssumeKit is a thin, security-opinionated application layer that composes workload identity, credential exchange, lifecycle handling, and a fetch-style SigV4 interface.

## Guides

| Guide | English | 日本語 |
| --- | --- | --- |
| Project overview / API | [README](../README.md) | [README](../README.ja.md) |
| Roadmap / provider compatibility contract | [Roadmap](roadmap.md) | [Roadmap](roadmap.ja.md) |
| End-to-end setup | [Getting started](getting-started.md) | [セットアップガイド](getting-started.ja.md) |
| Release-blocking real-cloud E2E | [Cloud Run E2E runbook](cloud-run-e2e.md) | [Cloud Run E2E runbook](cloud-run-e2e.ja.md) |
| AWS/GCP trust details | [GCP → AWS trust policy](gcp-aws-trust.md) | [GCP → AWS trust policy](gcp-aws-trust.ja.md) |
| Troubleshooting | [Troubleshooting](troubleshooting.md) | [トラブルシューティング](troubleshooting.ja.md) |
| Security boundaries | [Security model](security-model.md) | [セキュリティモデル](security-model.ja.md) |
| Vulnerability reporting | [Security policy](../SECURITY.md) | [セキュリティポリシー](../SECURITY.ja.md) |
| Contributing | [Contributing](../CONTRIBUTING.md) | [Contributing](../CONTRIBUTING.ja.md) |
| Conduct | [Code of Conduct](../CODE_OF_CONDUCT.md) | [行動規範](../CODE_OF_CONDUCT.ja.md) |

## Recommended reading order

1. Read the root [README](../README.md) for the purpose, API shape, and how AssumeKit differs from adjacent approaches.
2. Read the [Roadmap](roadmap.md) for v0.1 boundaries, supported SigV4 endpoint assumptions, and the provider compatibility/security contract.
3. Follow [Getting started](getting-started.md) to configure the Cloud Run service identity and AWS IAM role.
4. Review [GCP → AWS trust policy](gcp-aws-trust.md) before using a production AWS account.
5. Review [Security model](security-model.md) before enabling AssumeKit in a sensitive workload.
6. Before the first npm release, execute the [real Cloud Run → AWS E2E runbook](cloud-run-e2e.md) from the exact release commit.
7. Use [Troubleshooting](troubleshooting.md) when the metadata, STS, allowlist, SigV4, or E2E startup stages fail.

## Current status

AssumeKit is **early alpha**. The repository and documentation can be used to review and test the design, but the package is not published to npm yet. The first npm release is intentionally blocked on a real Cloud Run → AWS end-to-end test.

## License

The project is licensed under the MIT License. The authoritative license text is the root [LICENSE](../LICENSE); localized documentation does not replace it.

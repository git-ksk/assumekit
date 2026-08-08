# AssumeKit documentation

[日本語ドキュメント](README.ja.md)

AssumeKit is currently focused on **Google Cloud Run → Google service-account ID token → AWS STS → temporary AWS credentials → SigV4 HTTP requests**.

## Guides

| Guide | English | 日本語 |
| --- | --- | --- |
| Project overview / API | [README](../README.md) | [README](../README.ja.md) |
| End-to-end setup | [Getting started](getting-started.md) | [セットアップガイド](getting-started.ja.md) |
| AWS/GCP trust details | [GCP → AWS trust policy](gcp-aws-trust.md) | [GCP → AWS trust policy](gcp-aws-trust.ja.md) |
| Troubleshooting | [Troubleshooting](troubleshooting.md) | [トラブルシューティング](troubleshooting.ja.md) |
| Security boundaries | [Security model](security-model.md) | [セキュリティモデル](security-model.ja.md) |
| Vulnerability reporting | [Security policy](../SECURITY.md) | [セキュリティポリシー](../SECURITY.ja.md) |
| Contributing | [Contributing](../CONTRIBUTING.md) | [Contributing](../CONTRIBUTING.ja.md) |
| Conduct | [Code of Conduct](../CODE_OF_CONDUCT.md) | [行動規範](../CODE_OF_CONDUCT.ja.md) |

## Recommended reading order

1. Read the root [README](../README.md) for the purpose and API shape.
2. Follow [Getting started](getting-started.md) to configure the Cloud Run service identity and AWS IAM role.
3. Review [GCP → AWS trust policy](gcp-aws-trust.md) before using a production AWS account.
4. Review [Security model](security-model.md) before enabling AssumeKit in a sensitive workload.
5. Use [Troubleshooting](troubleshooting.md) when the metadata, STS, or SigV4 stages fail.

## Current status

AssumeKit is **early alpha**. The repository and documentation can be used to review and test the design, but the package is not published to npm yet. The first npm release is intentionally blocked on a real Cloud Run → AWS end-to-end test.

## License

The project is licensed under the MIT License. The authoritative license text is the root [LICENSE](../LICENSE); localized documentation does not replace it.

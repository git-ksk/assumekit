# AssumeKit documentation

AssumeKit is currently focused on **Google Cloud Run → Google service-account ID token → AWS STS → temporary AWS credentials → SigV4 HTTP requests**.

## Guides

| Guide | English | 日本語 |
| --- | --- | --- |
| End-to-end setup | [Getting started](getting-started.md) | [セットアップガイド](getting-started.ja.md) |
| AWS/GCP trust details | [GCP → AWS trust policy](gcp-aws-trust.md) | [GCP → AWS trust policy](gcp-aws-trust.ja.md) |
| Troubleshooting | [Troubleshooting](troubleshooting.md) | [トラブルシューティング](troubleshooting.ja.md) |
| Security boundaries | [Security model](security-model.md) | [セキュリティモデル](security-model.ja.md) |

## Recommended reading order

1. Read the root [README](../README.md) for the purpose and API shape.
2. Follow [Getting started](getting-started.md) to configure the Cloud Run service identity and AWS IAM role.
3. Review [GCP → AWS trust policy](gcp-aws-trust.md) before using a production AWS account.
4. Review [Security model](security-model.md) before enabling AssumeKit in a sensitive workload.
5. Use [Troubleshooting](troubleshooting.md) when the metadata, STS, or SigV4 stages fail.

## Current status

AssumeKit is **early alpha**. The repository and documentation can be used to review and test the design, but the package is not published to npm yet. The first npm release is intentionally blocked on a real Cloud Run → AWS end-to-end test.

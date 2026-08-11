# AssumeKit 日本語ドキュメント

[English documentation](README.md)

AssumeKit は現在、**Google Cloud Run → Google service-account ID token → AWS STS → temporary AWS credentials → SigV4 HTTP request** の経路を中心に実装・検証しています。

## まず読むもの

| 内容 | 日本語 | English |
| --- | --- | --- |
| Project概要 / API | [README](../README.ja.md) | [README](../README.md) |
| End-to-end設定 | [Cloud Run → AWS セットアップ](getting-started.ja.md) | [Getting started](getting-started.md) |
| Release前の実Cloud E2E | [Cloud Run E2E runbook](cloud-run-e2e.ja.md) | [Cloud Run E2E runbook](cloud-run-e2e.md) |
| AWS/GCP trust詳細 | [GCP → AWS trust policy](gcp-aws-trust.ja.md) | [GCP → AWS trust policy](gcp-aws-trust.md) |
| エラー切り分け | [トラブルシューティング](troubleshooting.ja.md) | [Troubleshooting](troubleshooting.md) |
| 脅威・境界・非対応 | [セキュリティモデル](security-model.ja.md) | [Security model](security-model.md) |
| 脆弱性報告 | [セキュリティポリシー](../SECURITY.ja.md) | [Security policy](../SECURITY.md) |
| 開発参加 | [Contributing](../CONTRIBUTING.ja.md) | [Contributing](../CONTRIBUTING.md) |
| 行動規範 | [行動規範](../CODE_OF_CONDUCT.ja.md) | [Code of Conduct](../CODE_OF_CONDUCT.md) |

## 推奨順序

1. [日本語README](../README.ja.md) で目的、API、現在のscopeを確認する。
2. [セットアップガイド](getting-started.ja.md) に沿って Cloud Run service identity と AWS IAM Role を構成する。
3. production accountで使う前に [GCP → AWS trust policy](gcp-aws-trust.ja.md) を確認する。
4. [セキュリティモデル](security-model.ja.md) で threat boundary と非対応範囲を確認する。
5. 初回npm release前に、release対象commitから [実Cloud Run → AWS E2E runbook](cloud-run-e2e.ja.md) を実行する。
6. metadata / STS / allowlist / SigV4 / E2E startup のどこかで失敗したら [トラブルシューティング](troubleshooting.ja.md) で段階的に切り分ける。

## AWS側で混同しやすい2つのPolicy

**Trust policy** と **permissions policy** は別です。

- Trust policy: 「どのGoogle workloadがこのRoleを取得できるか」
- Permissions policy: 「Role取得後にAWS上で何ができるか」

STS `AccessDenied` を直すためにtrust条件を広げたり、対象APIのpermission errorを直すためにtrust policyを変更したりしないよう、問題のstageを分けて確認してください。

## 秘密情報を保存しない

AssumeKitの基本方針では次を長期保存しません。

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- Google service-account private-key file
- Google ID token
- AWS STS session token

Role ARN、region、SigV4 service name、audience等は認証secretそのものではありませんが、public exampleでは実production identifierを使わずplaceholderを使用してください。

## 現在のstatus

AssumeKit は **early alpha** です。

repositoryとdocumentationは設計review・実装review・testに使用できますが、packageはまだnpmへ公開していません。初回npm releaseは実 Cloud Run → AWS end-to-end testが完了するまで意図的に止めています。

## 日本語版の扱い

日本語ドキュメントは英語版と同じ機能・安全上の意味を維持する方針です。コードやpublic APIを変更する際は、対応する日英ドキュメントを同時に更新します。

## License

ProjectはMIT Licenseです。法的に参照する正式なライセンス文はrepository rootの [LICENSE](../LICENSE) を使用してください。日本語ドキュメントはライセンス原文を置き換えるものではありません。

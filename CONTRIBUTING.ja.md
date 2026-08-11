# Contributing

[English](CONTRIBUTING.md)

AssumeKit の改善への協力を歓迎します。

## Issueを作る前に

- 既存IssueとREADME / docs / troubleshootingを確認してください。
- 認証情報、token、本番account ID、private Role ARN、service-account email、ローカルmachine path、顧客情報、PIIを貼らないでください。
- セキュリティ脆弱性の可能性がある場合は public Issue に詳細を書かず、[セキュリティポリシー](SECURITY.ja.md) に従ってください。

## Pull Requestを作る前に

可能な限り変更を小さく、目的を1つに絞ってください。

behaviorを変更する場合はtestを追加または更新してください。

最低限、次を実行してください。

```bash
npm ci
npm audit --audit-level=high
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

CIでも Node.js 22 / 24 を対象に同等の検証を行います。

## 公開repositoryに含めてはいけないもの

次をcommitしないでください。

- AWS access key / secret access key
- Google ID token
- AWS temporary credential / session token
- Google service-account private key
- 本番account ID / private Role ARN
- private service-account email
- 顧客情報・個人情報
- `/Users/...` 等の個人ローカルpath
- private endpointや内部host名

exampleでは `<AWS_ACCOUNT_ID>`、`example-project`、`example-*` 等の明確なplaceholderを使用してください。

## セキュリティ上重要な変更

次の領域は security-sensitive として扱います。

- IAM trust-policy example
- OIDC claim / audience handling
- Google metadata request
- STS endpoint selection
- signed-request host allowlisting / redirect policy
- timeout / retry behavior
- credential cache / refresh
- SigV4 signing
- request replay behavior
- logging / error message
- dependency / GitHub Actions / release configuration

この領域を変更するPRでは、正常系だけでなく failure mode と情報漏えいリスクも確認してください。

## Project scope

初期scopeは次です。

```text
external workload identity
        ↓
AWS STS AssumeRoleWithWebIdentity
        ↓
temporary AWS credentials
        ↓
SigV4 HTTP access
```

最初のproviderは GCP metadata service identity です。

次のような大きなarchitecture変更は、実装前にIssueで方向性を相談してください。

- daemon / proxy mode
- persistent credential storage
- static access-key support
- broad AWS SDK abstraction
- automatic IAM provisioning
- browser support
- provider interfaceを大きく壊す変更

## Documentation

public API、設定値、release process、security behaviorを変更した場合は、英語版だけでなく対応する日本語ドキュメントも同時に更新してください。

日本語ドキュメント一覧は [docs/README.ja.md](docs/README.ja.md) にあります。

## License

Contribution はrepositoryのMIT Licenseの下で提供されるものとして扱います。正式なライセンス文は [LICENSE](LICENSE) を参照してください。

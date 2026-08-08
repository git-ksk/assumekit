# AssumeKit for AWS

**外部クラウドの Workload Identity から、長期アクセスキーなしで AWS を呼び出すための軽量ライブラリ。**

AssumeKit は、AWS 外部の workload から OIDC federation で短期 AWS Credential を取得し、SigV4 署名済み HTTP request を送る TypeScript/Node.js ライブラリです。

最初の対象は **Google Cloud Run → Google service-account ID token → AWS STS `AssumeRoleWithWebIdentity` → 一時 Credential → SigV4 `fetch()`** です。

> 現在は **early alpha** です。v1.0 までは公開 API が変更される可能性があります。初回 npm release は実 Cloud Run → AWS E2E が完了するまで行いません。

AssumeKit は独立した OSS であり、Amazon Web Services の公式プロジェクトではありません。

[English README](README.md) · [ドキュメント一覧](docs/README.md)

## 何を簡単にするか

Cloud Run から SigV4 保護された AWS endpoint を呼ぶ場合、通常は次の glue code が必要です。

1. Google metadata server から service-account ID token を取得
2. AWS STS `AssumeRoleWithWebIdentity` で一時 Credential に交換
3. Credential の cache と期限前 refresh
4. 各 HTTP request を SigV4 署名
5. token / temporary Credential をログや永続storageへ漏らさない

AssumeKit はこれを通常の `fetch()` に近い API へまとめます。Cloud Run runtime に sidecar、常駐 proxy、AWS CLI、Google auth SDK、AWS SDK 全体を必須にはしません。

```text
Cloud Run service identity
        │
        ▼
Google metadata ID token
        │
        ▼
Regional AWS STS
AssumeRoleWithWebIdentity
        │
        ▼
Temporary AWS credentials
        │
        ▼
SigV4 fetch
        │
        ├── AWS MCP endpoints
        ├── API Gateway IAM auth
        ├── OpenSearch
        └── other SigV4 HTTP endpoints
```

## 最短セットアップ

AssumeKit は IAM を自動provisionしません。設定を意図的に明示しています。

1. Cloud Run workload用の**専用user-managed Google service account**を作る。
2. service accountの**stable numeric `uniqueId`**を取得する。
3. workload/Role専用のtoken **audience**を決める。
4. Google service-account identityとaudienceを固定したAWS IAM Role **trust policy**を作る。
5. 対象AWS APIに必要な権限だけを別の**permissions policy**としてRoleへ付ける。
6. Cloud Runにservice accountをattachし、アプリへ `roleArn` / `region` / `service` / `audience` を設定する。

コピペ可能な `gcloud` / AWS CLI 例は **[Cloud Run → AWS セットアップガイド](docs/getting-started.ja.md)** にまとめています。

> trust policy は「**誰がRoleを取得できるか**」、permissions policy は「**取得したRoleで何ができるか**」を決める別の制御です。

## インストール

**まだ npm には公開していません。** 実 Cloud Run → AWS E2E を通した後に初回 alpha を公開します。

公開後:

```bash
npm install assumekit
```

## Cloud Run 例

```ts
import { createAwsFetch, gcpMetadataIdentity } from "assumekit";

const awsFetch = createAwsFetch({
  roleArn: process.env.AWS_ROLE_ARN!,
  region: process.env.AWS_REGION!,
  service: process.env.AWS_SERVICE!,
  identity: gcpMetadataIdentity({
    audience: process.env.AWS_OIDC_AUDIENCE!,
  }),
});

const response = await awsFetch(process.env.AWS_ENDPOINT!);
```

秘密情報ではない設定例:

```dotenv
AWS_ROLE_ARN=arn:aws:iam::<AWS_ACCOUNT_ID>:role/AssumeKitExample
AWS_REGION=ap-northeast-1
AWS_SERVICE=execute-api
AWS_OIDC_AUDIENCE=assumekit-prod-example
AWS_ENDPOINT=https://example.execute-api.ap-northeast-1.amazonaws.com/health
```

`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / Google service-account private-key file / 手動保存したGoogle ID tokenは不要です。

`service` は AWS の **SigV4 signing name** で、製品名と一致するとは限りません。API Gateway IAM auth は `execute-api` です。他サービスはAWS公式ドキュメントでsigning nameを確認してください。

## ドキュメント

| 内容 | English | 日本語 |
| --- | --- | --- |
| End-to-end設定 | [Getting started](docs/getting-started.md) | [セットアップガイド](docs/getting-started.ja.md) |
| Google → AWS IAM trust | [Trust policy](docs/gcp-aws-trust.md) | [Trust policy](docs/gcp-aws-trust.ja.md) |
| エラー切り分け | [Troubleshooting](docs/troubleshooting.md) | [トラブルシューティング](docs/troubleshooting.ja.md) |
| 脅威・境界・非対応 | [Security model](docs/security-model.md) | [セキュリティモデル](docs/security-model.ja.md) |

## 安全側のデフォルト

- AWS STS は `region` から Regional endpoint を自動選択
- public API から任意STS endpointの指定を排除
- GCP metadata / STS request はredirectを追従しない
- GCP metadata は1試行3秒、STSは1試行10秒でtimeout
- metadata / STSの一時障害だけを限定retry
- SigV4署名後のAWS API/MCP呼び出しはretry `0` がdefault
- temporary AWS Credentialはprocess memoryだけに保持
- 同時request時のCredential refreshを1回へ集約
- GCP metadataの危険なpath segmentをreject

AWS service callのretryは `retries` で明示的に有効化できますが、POST等の非冪等requestでは二重実行に注意してください。

## 設定項目

### `createAwsFetch()`

| Option | 必須 | Default | 用途 |
| --- | --- | --- | --- |
| `roleArn` | yes | — | assumeするAWS IAM Role |
| `region` | yes | — | target AWS region / STS region |
| `service` | yes | — | `execute-api`等のSigV4 signing service name |
| `identity` | yes | — | Workload Identity Provider |
| `sessionName` | no | generated | STS Role session name。PIIは避ける |
| `durationSeconds` | no | AWS default | 900–43200。Role側上限にも従う |
| `refreshBeforeMs` | no | 300000 | expiration前のrefresh時間 |
| `stsTimeoutMs` | no | 10000 | STS 1試行timeout |
| `stsMaxRetries` | no | 2 | STS transient retry回数 |
| `stsRetryBaseMs` | no | 100 | full-jitter retry初期window |
| `retries` | no | 0 | signed AWS service-call retry |

### `gcpMetadataIdentity()`

| Option | 必須 | Default | 用途 |
| --- | --- | --- | --- |
| `audience` | yes | — | Google ID-token audience。AWS trust `oaud` と一致させる |
| `serviceAccount` | no | `default` | metadata service-account path segment |
| `timeoutMs` | no | 3000 | metadata 1試行timeout |
| `maxRetries` | no | 2 | metadata transient retry |
| `retryBaseMs` | no | 50 | full-jitter retry初期window |

## IAM設定の原則

- 可能ならCloud Run専用service accountを使う。
- AWS Google federation条件では、主要なstable identifierとしてservice-account emailではなく**numeric unique ID**を使う。
- audienceはworkload/Role単位で分け、Google token取得とAWS trust policyで完全一致させる。
- STS `AccessDenied`を直すために `aud` / `oaud` / `sub` conditionを消さない。
- RoleのAWS permissionsはtrust policyと分離し、least privilegeにする。
- `sessionName` に人名・メール・顧客ID等を入れない。session/identity情報はCloudTrailへ現れ得る。

詳細: [docs/gcp-aws-trust.ja.md](docs/gcp-aws-trust.ja.md)

## v0.1 の範囲

対応:

- GCP metadata service-account ID token
- Regional AWS STS `AssumeRoleWithWebIdentity`
- temporary Credentialのcache・期限前refresh
- 同時refreshの重複排除
- Credential取得時のtimeout / bounded retry
- SigV4 `fetch()`
- Node.js 22+ / TypeScript

未対応:

- persistent credential storage
- static AWS access-key auth
- local AWS profile / AWS IAM Identity Center
- proxy/daemon mode
- automatic IAM provisioning
- browser support
- non-idempotent AWS requestの自動retry
- すべてのcloud/provider/AWS partition combinationの暗黙対応

将来的には GitHub Actions / Azure / Kubernetes OIDC 等を同じprovider interfaceへ追加できる構成です。

## ローカル開発

`gcpMetadataIdentity()` はGoogle metadata serverを利用するため、通常のローカルPCでは動きません。unit testではtest用 `WorkloadIdentityProvider` を注入してください。Cloud Runを再現するためだけにproduction codeへ長期key fallbackを追加する方針ではありません。

## Security

AssumeKit は認証インフラです。production利用前に [セキュリティモデル](docs/security-model.ja.md) を確認してください。

live token、temporary credential、private key、customer data、PIIをexampleやpublic issueへ貼らないでください。

脆弱性報告は [SECURITY.md](SECURITY.md) を参照してください。

## Contributing

Issue / focused PR を歓迎します。[CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

## License

MIT

# AssumeKit for AWS

**外部クラウドの Workload Identity から、長期アクセスキーなしで AWS を呼び出すための軽量ライブラリ。**

AssumeKit は、AWS 外部の workload から OIDC federation で短期 AWS Credential を取得し、制約付きSigV4 HTTP requestを送るTypeScript/Node.jsライブラリです。

最初の対象は **Google Cloud Run → Google service-account ID token → AWS STS `AssumeRoleWithWebIdentity` → 一時Credential → constrained SigV4 `fetch()`** です。

> 現在は **early alpha** です。v1.0までは公開APIが変更される可能性があります。初回npm releaseは実Cloud Run → AWS E2Eが完了するまで行いません。

AssumeKit は独立したOSSであり、Amazon Web Servicesの公式プロジェクトではありません。

[English README](README.md) · [日本語ドキュメント](docs/README.ja.md) · [Roadmap](docs/roadmap.ja.md)

## 何を簡単にするか

Google → AWSのworkload-identity federation mechanism自体は標準技術です。AssumeKitは**新しいfederation protocolを発明するものではありません**。

価値は、application側で繰り返し必要になる次のglue codeを、安全側のdefaultとともにまとめることです。

1. platformのidentity sourceから短期workload identity tokenを取得
2. AWS STS `AssumeRoleWithWebIdentity` でtemporary credentialへ交換
3. temporary AWS credentialをcache・期限前refresh
4. 送信先を制約してSigV4 HTTP requestを生成
5. identity token / temporary credentialをログや永続storageへ漏らさない

これを小さな`fetch()`-style APIへまとめ、sidecar/proxy、static AWS key、Google service-account JSON key、runtime APIにおけるAWS SDK credential stack全体を必須にしません。

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
Constrained SigV4 fetch
```

## 他のapproachとの違い

| Approach | 向いているケース | AssumeKitとの違い |
| --- | --- | --- |
| metadata + STS + SigV4を自前実装 | federation flowを自分たちで組み立て・保守したい | credential lifecycleと保守的security defaultまで一連でまとめる |
| AWS SDK credential-provider stack | AWS SDK client/provider中心のapplication | public runtime surfaceを軽量なSigV4 `fetch()` に絞る |
| static AWS key / service-account key file | workload identityを使えないlegacy環境 | 意図的に非対応。workload identityをtrust boundaryにする |
| sidecar/proxy credential broker | process/network mediationを中央集約したい | in-process libraryで、別service/daemonを要求しない |

つまりAssumeKitは**薄いcross-cloud workload-identity fetch layer**であり、generic AWS auth framework、secret manager、IAM provisioner、AWS SDK全体の代替ではありません。この境界は [Roadmap / compatibility contract](docs/roadmap.ja.md) で固定しています。

## 最短セットアップ

AssumeKitはIAMを自動provisionしません。設定を意図的に明示しています。

1. Cloud Run workload用の**専用user-managed Google service account**を作る。
2. service accountの**stable numeric `uniqueId`**を取得する。
3. workload/Role専用のtoken **audience**を決める。
4. Google service-account identityとaudienceを固定したAWS IAM Role **trust policy**を作る。
5. 対象AWS APIに必要な権限だけを別の**permissions policy**としてRoleへ付ける。
6. Cloud Runにservice accountをattachし、`roleArn` / `region` / `service` / `audience` / 許可するAWS request hostを設定する。

コピペ可能な手順は [Cloud Run → AWS セットアップガイド](docs/getting-started.ja.md) を参照してください。

> trust policyは「**誰がRoleを取得できるか**」、permissions policyは「**取得したRoleで何ができるか**」を決める別の制御です。

## インストール

**まだnpmには公開していません。** 実Cloud Run → AWS release-gate E2Eを通した後に初回alphaを公開します。

公開後:

```bash
npm install assumekit
```

## Cloud Run 例

```ts
import { createAwsFetch, gcpMetadataIdentity } from "assumekit";

const endpoint = new URL(process.env.AWS_ENDPOINT!);
const awsFetch = createAwsFetch({
  roleArn: process.env.AWS_ROLE_ARN!,
  region: process.env.AWS_REGION!,
  service: process.env.AWS_SERVICE!,
  identity: gcpMetadataIdentity({
    audience: process.env.AWS_OIDC_AUDIENCE!,
  }),
  allowedHosts: [endpoint.host],
});

const response = await awsFetch(endpoint);
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

`service` はAWSの**SigV4 signing name**で、製品名と一致するとは限りません。API Gateway IAM authは`execute-api`です。他serviceはAWS公式ドキュメントでsigning nameを確認してください。

`allowedHosts` はSigV4署名を許可する送信先hostの完全一致allowlistです。schemeやpathは受け付けません。信頼済み`AWS_ENDPOINT`から`host`を取得して渡す形を推奨します。

signed AWS service requestはcallerが追従を指定してもredirectを拒否します。最終canonical HTTPS endpointを直接指定してください。一律service-call timeoutは強制しないため、deadlineが必要なら`AbortSignal.timeout(...)`等を`signal`として渡します。

## ドキュメント

| 内容 | 日本語 | English |
| --- | --- | --- |
| Roadmap / compatibility contract | [Roadmap](docs/roadmap.ja.md) | [Roadmap](docs/roadmap.md) |
| End-to-end設定 | [セットアップガイド](docs/getting-started.ja.md) | [Getting started](docs/getting-started.md) |
| Release-blocking実Cloud E2E | [Cloud Run E2E runbook](docs/cloud-run-e2e.ja.md) | [Cloud Run E2E runbook](docs/cloud-run-e2e.md) |
| Google → AWS IAM trust | [Trust policy](docs/gcp-aws-trust.ja.md) | [Trust policy](docs/gcp-aws-trust.md) |
| エラー切り分け | [トラブルシューティング](docs/troubleshooting.ja.md) | [Troubleshooting](docs/troubleshooting.md) |
| 脅威・境界・非対応 | [セキュリティモデル](docs/security-model.ja.md) | [Security model](docs/security-model.md) |
| 脆弱性報告 | [セキュリティポリシー](SECURITY.ja.md) | [Security policy](SECURITY.md) |
| 開発参加 | [Contributing](CONTRIBUTING.ja.md) | [Contributing](CONTRIBUTING.md) |

## 安全側のdefault

- AWS STSは`region`からRegional endpointを導出
- public APIから任意STS endpoint指定を排除
- GCP metadata / STS requestはredirectを拒否
- signed AWS service requestはHTTPSかつ`allowedHosts`完全一致が必須
- signed AWS service request自体もredirectを拒否
- GCP metadataは1試行3秒、STSは1試行10秒でtimeout
- metadata / STSの一時障害だけをbounded full-jitter retry
- AWS service-call retryはdefault `0`
- temporary AWS credentialはprocess memoryだけに保持
- 同時request時のcredential refreshをsingle-flight化
- GCP metadataの危険なpath segmentをreject

Credential retryとAWS service-call retryは別です。service-call retryを有効化する場合はreplay safetyを確認し、deadlineが必要な場合はcaller側で`AbortSignal`を渡してください。

## 設定項目

### `createAwsFetch()`

| Option | 必須 | Default | 用途 |
| --- | --- | --- | --- |
| `roleArn` | yes | — | assumeするAWS IAM Role |
| `region` | yes | — | target AWS region / STS region |
| `service` | yes | — | `execute-api`等のSigV4 signing service name |
| `identity` | yes | — | Workload Identity Provider |
| `allowedHosts` | yes | — | signed AWS service requestを許可するHTTPS host |
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
- AWS Google federation条件ではservice-account emailより**numeric unique ID**を主要stable identifierとして使う。
- audienceはworkload/Role単位で分け、Google token取得とAWS trust policyで完全一致させる。
- STS `AccessDenied`を直すために`aud` / `oaud` / `sub` conditionを消さない。
- Role permissionsはtrust policyと分離し、least privilegeにする。
- `sessionName`に人名・メール・顧客ID等を入れない。

詳細は [GCP → AWS trust policy](docs/gcp-aws-trust.ja.md) を参照してください。

## v0.1 の範囲

対応:

- GCP metadata service-account ID token
- Regional AWS STS `AssumeRoleWithWebIdentity`
- temporary credentialのcache・期限前refresh
- 同時refreshの重複排除
- credential取得時のtimeout / bounded retry
- signed request送信先のHTTPS host allowlist
- signed AWS service requestのredirect拒否
- SigV4 `fetch()`
- Node.js 22+ / TypeScript

非対応:

- persistent credential storage
- static AWS access-key auth
- Google service-account JSON-key fallback
- local AWS profile / AWS IAM Identity Center
- proxy/daemon mode
- automatic IAM provisioning
- generic secret management
- browser support
- signed application service callすべてへの一律timeout
- non-idempotent AWS requestの自動retry
- 全cloud/provider/AWS partition combinationの暗黙対応

endpoint compatibility、provider要件、post-v0.1方向性は [Roadmap](docs/roadmap.ja.md) にまとめています。今後一般化するのは既存interface背後の**workload identity provider**であり、AWS-facing APIを広範なSDK abstractionへ膨らませる方針ではありません。

## ローカル開発

`gcpMetadataIdentity()`はGoogle metadata serverを使うため、通常のローカルPCでは動きません。unit testではtest用`WorkloadIdentityProvider`を注入し、Cloud Run再現のためだけにproduction codeへ長期key fallbackを追加しません。

release-blockingの実Cloud E2Eには`npm run e2e:cloud-run`を使います。[Cloud Run E2E runbook](docs/cloud-run-e2e.ja.md) に従うと、buildpack runtime固定、`AWS_ENDPOINT` host allowlist、redirect拒否、最終smoke request timeoutまで含めて検証できます。

## Security

AssumeKitは認証インフラです。production利用前に [セキュリティモデル](docs/security-model.ja.md) を確認してください。

live token、temporary credential、private key、customer data、PIIをexampleやpublic issueへ貼らないでください。脆弱性報告は [SECURITY.ja.md](SECURITY.ja.md) を参照してください。

## Contributing

Issue / focused PRを歓迎します。[CONTRIBUTING.ja.md](CONTRIBUTING.ja.md) を参照してください。

## License

MIT。正式なライセンス文は [LICENSE](LICENSE) を参照してください。

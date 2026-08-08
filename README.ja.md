# AssumeKit for AWS

**外部クラウドの Workload Identity から、長期アクセスキーなしで AWS を呼び出すための軽量ライブラリ。**

AssumeKit は、AWS 外部のワークロードから OIDC フェデレーションで短期 AWS 認証情報を取得し、SigV4 署名済み HTTP リクエストを送る TypeScript/Node.js ライブラリです。

最初の対象は **Google Cloud Run → Google service-account ID token → AWS STS `AssumeRoleWithWebIdentity` → 一時 Credential → SigV4 `fetch()`** です。

> 現在は **early alpha** です。v1.0 までは公開 API が変更される可能性があります。

AssumeKit は独立した OSS であり、Amazon Web Services の公式プロジェクトではありません。

## 何を簡単にするか

Cloud Run から SigV4 保護された AWS エンドポイントを呼ぶ場合、通常は次の glue code が必要です。

1. Google metadata server から service-account ID token を取得
2. AWS STS `AssumeRoleWithWebIdentity` で一時 Credential に交換
3. Credential のキャッシュと期限前更新
4. 各 HTTP リクエストを SigV4 署名
5. token / Credential をログや永続ストレージへ漏らさない

AssumeKit はこれを通常の `fetch()` に近い API へまとめます。sidecar、常駐 proxy、AWS CLI、Google auth SDK、AWS SDK 全体を必須にはしません。

## インストール

**まだ npm には公開していません。** 実際の Cloud Run → AWS E2E を通した後に初回 alpha を公開する予定です。

公開後は次の形です。

```bash
npm install assumekit
```

## Cloud Run 例

```ts
import { createAwsFetch, gcpMetadataIdentity } from "assumekit";

const awsFetch = createAwsFetch({
  roleArn: process.env.AWS_ROLE_ARN!,
  region: "ap-northeast-1",
  service: "execute-api",
  identity: gcpMetadataIdentity({
    audience: "assumekit",
  }),
});

const response = await awsFetch(
  "https://example.execute-api.ap-northeast-1.amazonaws.com/health",
);
```

`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / service-account key file の配置を前提にしません。

## 安全側のデフォルト

- AWS STS は `region` から Regional endpoint を自動選択
- 公開 API から任意 STS endpoint の指定を排除
- GCP metadata は1試行3秒、STSは1試行10秒で timeout
- metadata / STS の一時障害だけを限定 retry
- SigV4 署名後の AWS API/MCP 呼び出しは retry `0` がデフォルト
- 一時 AWS Credential はプロセスメモリだけに保持
- 同時リクエスト時の Credential refresh を1回へ集約

AWS API 側の retry は `retries` で明示的に有効化できますが、POST など非冪等リクエストでは二重実行に注意してください。

## AWS trust policy

`accounts.google.com` を無条件に信頼せず、Google service account の stable unique ID と期待する audience を trust policy で固定します。

詳細は [docs/gcp-aws-trust.md](docs/gcp-aws-trust.md) を参照してください。

## v0.1 の範囲

- GCP metadata service-account ID token
- Regional AWS STS `AssumeRoleWithWebIdentity`
- 一時 Credential のキャッシュ・期限前更新
- 同時 refresh の重複排除
- Credential 取得時の timeout / bounded retry
- SigV4 `fetch()`
- Node.js 22+ / TypeScript

将来的には GitHub Actions / Azure / Kubernetes OIDC などの Workload Identity Provider を同じインターフェースへ追加できる構成にします。

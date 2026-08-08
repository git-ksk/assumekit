# AWS AssumeKit

**外部クラウドの Workload Identity から、長期アクセスキーなしで AWS を呼び出すための軽量ライブラリ。**

AWS AssumeKit は、Cloud Run など AWS 外部のワークロードから OIDC フェデレーションを使って短期 AWS 認証情報を取得し、SigV4 署名済み HTTP リクエストを送るための TypeScript/Node.js ライブラリです。

> 現在は **early alpha** です。最初の対象は Google Cloud Run → AWS です。

## 目的

Cloud Run から SigV4 保護された AWS エンドポイントを呼ぶ場合、通常は次の処理が必要です。

1. Google の Workload Identity Token を取得
2. AWS STS `AssumeRoleWithWebIdentity` で交換
3. 一時 AWS Credential をキャッシュ・更新
4. 各 HTTP リクエストを SigV4 署名

AWS AssumeKit はこれを通常の `fetch()` に近い形へまとめます。

```ts
import { createAwsFetch, gcpMetadataIdentity } from "aws-assumekit";

const awsFetch = createAwsFetch({
  roleArn: process.env.AWS_ROLE_ARN!,
  region: "us-east-1",
  service: "execute-api",
  identity: gcpMetadataIdentity({ audience: "aws-assumekit" }),
});

const response = await awsFetch("https://example.amazonaws.com/");
```

`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` の配置を前提にしません。

## 方針

- 長期 AWS キーを置かない
- sidecar / 常駐 proxy を増やさない
- Cloud Run 上の既存 Node.js アプリへ直接組み込む
- MCP 専用にはせず、SigV4 HTTP 全般を対象にする
- 非冪等な POST の二重実行を避けるため、HTTP retry はデフォルト `0`
- GCP から開始し、GitHub Actions / Azure / Kubernetes OIDC へ拡張可能な設計にする

詳細は [README.md](README.md) を参照してください。

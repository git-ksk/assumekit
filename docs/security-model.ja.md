# セキュリティモデル

AssumeKit は認証境界を扱うライブラリです。この文書では、何を守る設計なのか、何を前提とするのか、そして**何を守れないのか**を明示します。

現時点で第三者によるformal security auditは受けていません。実Cloud Run→AWS E2Eとrelease hardeningが完了するまではearly alphaとして扱ってください。

## 機密性が高い値

runtimeで扱う主な機密値は次です。

1. short-lived Google service-account ID token
2. AWS STSが返すtemporary access key ID / secret access key / session token

AWS Role ARNとtoken audienceは識別子であり、credentialそのものではありません。

## Trust boundary

```text
Cloud Run process
  │
  ├─ HTTP → Google metadata server
  │           short-lived Google ID token
  │
  ├─ HTTPS → Regional AWS STS
  │           token + IAM trust policyを検証
  │           temporary AWS credentials
  │
  └─ HTTPS → target AWS service
              temporary credentialsでSigV4署名
```

安全性はライブラリ単体ではなく、次の組み合わせで成立します。

- Cloud Run service identity
- AWS IAM Role trust policy
- AWS IAM Role permissions policy
- application/container integrity
- target AWS service authorization
- logging/observability運用

## AssumeKitが提供する防御

### 長期AWS keyを前提にしない

Cloud Run service identityを起点に、Google-signed ID tokenをtemporary AWS credentialへ交換します。`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` や Google service-account private-key file を必須にしません。

### audienceを固定したfederation

`gcpMetadataIdentity()` は明示したaudience向けのID tokenを要求します。AWS trust policy側では `accounts.google.com:oaud` でaudienceを固定し、mapped `aud` / `sub` でservice accountのstable numeric unique IDを固定します。

### Credential交換先を固定

- GCP metadata base URLはprovider実装で固定。
- AWS STS endpointは設定regionから導出。
- public APIから任意STS endpointを指定できない。
- metadata / STS requestはredirectを拒否。

通常設定だけでID tokenを任意host/redirect先へ送ってしまうリスクを減らしています。

### Temporary credentialはメモリだけ

AssumeKitはtemporary AWS credentialをdisk、DB、environment variable、設定ファイルへ永続化しません。

### Credential retryはbounded

metadata/STSの一時障害だけをbounded full-jitter retryします。対象AWS service callのretryは別設定で、非冪等requestの再実行を避けるためdefault `0` です。

### Single-flight refresh

同時request時は1つのcredential refreshを共有し、不要なID token発行・STS session増加を抑えます。

### 入力validation

region/service/session関連設定やGCP metadata path segmentを検証し、危険なpath normalizationを拒否します。

## ライブラリ外で必要な対策

### AWS Role permissionsは最小権限

AssumeKitが取得できる権限はRole policy次第です。Roleが広すぎれば、この小さな認証経路が大きな権限を持つことになります。対象API/resourceだけに絞ってください。

### Trust policyを絞る

conditionなしで `accounts.google.com` 全体を信頼しないでください。Google service-account identityとaudienceを固定します。

詳細: [GCP → AWS trust policy](gcp-aws-trust.ja.md)

### 専用Cloud Run service identity

可能な限りuser-managed専用service accountを使い、広い権限を持つdefault service accountの流用を避けます。

### Application compromise

Cloud Run container/process内で任意コード実行を奪われた場合、AssumeKitはambient workload identityそのものを守れません。攻撃者はID tokenを要求し、trusted Roleに付与された範囲でAWSへアクセスできる可能性があります。

そのためcontainer/runtime hardeningとleast-privilege IAMは必須です。

### SSRF / untrusted URL

AssumeKitはapplicationが渡したtarget URLへ署名付きrequestを送ります。untrusted userが任意AWS destinationやrequest parameterを選べる設計にしないでください。application-level authorizationが必要です。

### service retryを有効にした場合のreplay

`retries` defaultは `0` です。値を増やす場合、対象operationのidempotencyを利用者側で保証する必要があります。任意MCP/API POSTが再送可能かをライブラリは判断できません。

### Logging

Google ID token / temporary AWS credential / Authorization headerをログ出力しないでください。

Role session nameやfederation属性はCloudTrailへ現れ得るため、人名・メール・顧客IDなどPIIを `sessionName` に使わないでください。

## Dependency / CI

現repoでは次を行っています。

- npm lockfileをcommit
- CIは `npm ci --ignore-scripts`
- supported Node.js versionでtest
- GitHub Actionsをcommit SHA pin
- runtime dependencyを小さく維持
- `npm pack --dry-run` で公開package形状を確認

npm公開時は長期npm tokenをrepository secretへ保存する方式より、Trusted Publishing/OIDC + provenanceを使う予定です。

## 現在の非対応・非保証

- IAM policyの自動provision/auditはしない。
- assumed Roleのeffective permissionsを検証しない。
- browser-side authは提供しない。
- local static-key fallbackは提供しない。
- compromise済みCloud Run processは保護できない。
- application-level idempotencyは提供しない。
- すべてのAWS partition/provider combination対応を暗黙に保証しない。

## Vulnerability report

[SECURITY.md](../SECURITY.md) に従ってください。public issueにlive token、credential、customer payload、機密なorganization identifierを貼らないでください。

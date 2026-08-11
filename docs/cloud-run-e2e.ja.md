# Release E2E: Cloud Run → AWS

このrunbookでは、初回npm releaseを止めている実identity chainを、実際のCloud Run **Service** revisionで確認します。

```text
Cloud Run service account
  → Google metadata ID token
  → Regional AWS STS AssumeRoleWithWebIdentity
  → temporary AWS credentials
  → SigV4 HTTPS request
  → configured AWS endpoint
```

このE2Eが成功し、安全な形で証跡を確認するまでは初回npm alphaを公開しません。

## 安全ルール

- dedicated user-managed Google service accountを使う。
- AWS IAM Roleは最小権限にし、Google federation trust policyを厳密に絞る。
- smoke request先は信頼済みかつ副作用のないAWS endpointにする。read-onlyな `GET` health/status endpointを推奨。
- AWS service-call retryは `0` のままにする。
- 一時Cloud Run Serviceはprivateのままにする。public公開は不要。
- Google ID token、AWS temporary credential、Authorization header、customer dataをログやIssueへ載せない。

## 1. 値を用意する

release対象の正確な `main` commitをcheckoutしたrepository rootで作業します。

```bash
export GCP_PROJECT_ID="example-project"
export GCP_REGION="asia-northeast1"
export E2E_SERVICE="assumekit-release-e2e"
export GCP_SERVICE_ACCOUNT_EMAIL="assumekit-runtime@example-project.iam.gserviceaccount.com"

export AWS_ROLE_ARN="arn:aws:iam::<AWS_ACCOUNT_ID>:role/AssumeKitExample"
export AWS_REGION="ap-northeast-1"
export AWS_SERVICE="execute-api"
export AWS_OIDC_AUDIENCE="assumekit-prod-example"
export AWS_ENDPOINT="https://example.execute-api.ap-northeast-1.amazonaws.com/health"
```

AWS Role trust policyでは、対象Google service account identityと `AWS_OIDC_AUDIENCE` を事前に固定しておきます。詳細は [GCP → AWS trust policy](gcp-aws-trust.ja.md) を参照してください。

## 2. 一時E2E Serviceをdeployする

repository rootから実行します。

```bash
gcloud run deploy "$E2E_SERVICE" \
  --source . \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --service-account "$GCP_SERVICE_ACCOUNT_EMAIL" \
  --set-build-env-vars "GOOGLE_NODEJS_VERSION=24.x.x" \
  --command npm \
  --args run,e2e:cloud-run \
  --no-allow-unauthenticated \
  --set-env-vars "AWS_ROLE_ARN=${AWS_ROLE_ARN},AWS_REGION=${AWS_REGION},AWS_SERVICE=${AWS_SERVICE},AWS_OIDC_AUDIENCE=${AWS_OIDC_AUDIENCE},AWS_ENDPOINT=${AWS_ENDPOINT}"
```

Dockerfileが無いこのrepositoryをCloud Runへsource deployするとGoogle Cloud buildpacksが使われます。E2Eではbuildpack runtimeを `GOOGLE_NODEJS_VERSION=24.x.x` でNode.js 24系へ固定し、package側の広いnpm互換範囲にruntime選択を任せません。AssumeKitは `gcp-build` でimage build時に `dist/` を生成し、runtimeのE2E commandはsmoke testだけを実行します。runtimeにTypeScript compilerが残っていることへ依存しません。

Cloud Run通常のdeployment health checkをそのまま利用できます。E2E processはAWS request成功後まで `0.0.0.0:$PORT` をlistenしないため、metadata・STS・署名・allowlist・redirect・timeout・対象AWS serviceのどこかで失敗するとrevisionはhealthyになりません。最後のAWS smoke requestは15秒で打ち切り、signed service redirectは拒否します。

## 3. 成功を確認する

成功時のapplication logには次のメッセージが出ます。

```text
Cloud Run → AWS E2E passed with HTTP 2xx.
```

最近のログは次で確認できます。

```bash
gcloud run services logs read "$E2E_SERVICE" \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --limit 50
```

release gateを閉じる前に次を全部確認します。

- revisionが意図したGoogle service accountを使っている。
- 実metadata token取得が成功した。
- Regional STS `AssumeRoleWithWebIdentity` が成功した。
- SigV4 HTTPS requestは設定した `AWS_ENDPOINT` の完全一致hostだけへ送られた。
- service redirectを追従していない。
- 対象AWS endpointが15秒のsmoke上限内に成功HTTP statusを返した。
- application logにGoogle ID token、AWS temporary credential、Authorization headerが出ていない。
- AWS CloudTrailで意図した `AssumeRoleWithWebIdentity` のRole/session経路を確認でき、想定外identityがない。

証跡として残すのはcommit SHA、timestamp、Cloud Run revision名、HTTP status、AWS region、SigV4 service名などsanitize済み情報だけにします。

## 4. 後片付け

結果を記録したら一時Serviceを削除します。

```bash
gcloud run services delete "$E2E_SERVICE" \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --quiet
```

このE2E Serviceはproduction APIとして常設する用途ではありません。

## 失敗時の切り分け

| 症状 | 確認内容 |
| --- | --- |
| `K_SERVICE` error | Cloud Run Service revision内で実行されていない。 |
| `Cannot find ... dist/index.js` | repository rootからbuildされていない、または `gcp-build` が完了していない。 |
| Node/buildpack version error | build environmentに `GOOGLE_NODEJS_VERSION=24.x.x` が入っているか確認する。 |
| `AWS_ENDPOINT must use HTTPS` | HTTPS endpointだけを設定する。 |
| signed request host / `allowedHosts` error | `AWS_ENDPOINT` がsmoke testで想定する完全一致hostではない。任意入力を通すためにallowlistを広げない。 |
| redirect error | 対象がredirectを返している。redirect追従を有効化せず、最終canonical AWS HTTPS endpointを設定する。 |
| request abort/timeout | 対象が15秒以内に応答していない。上限を外すのではなくendpoint health/networkingを確認する。 |
| metadata error/timeout | revision service accountとGoogle metadata availabilityを確認する。 |
| STS `InvalidIdentityToken` / `AccessDenied` | `aud` / `oaud` / `sub`、audience、Role ARNを確認する。テストを通すためにtrust policyを緩めない。 |
| target `403` / `AccessDenied` | federation trustではなくassumed Roleのpermissions policyを確認する。 |
| deployがhealthyにならない | Cloud Run logsを確認する。AWS smoke成功までport listenしないのは意図した動作。 |

詳細は [トラブルシューティング](troubleshooting.ja.md) を参照してください。

## 公式リファレンス

- Google Cloud Run — source deploy: https://cloud.google.com/run/docs/deploying-source-code?hl=ja
- Google Cloud SDK — `gcloud run deploy`: https://cloud.google.com/sdk/gcloud/reference/run/deploy
- Google Cloud SDK — Cloud Run Service logs: https://cloud.google.com/sdk/gcloud/reference/run/services/logs/read
- Google Cloud SDK — Cloud Run Service delete: https://cloud.google.com/sdk/gcloud/reference/run/services/delete
- Google Cloud Buildpacks — Node.js: https://cloud.google.com/docs/buildpacks/nodejs?hl=ja

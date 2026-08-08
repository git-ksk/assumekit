# セットアップガイド: Cloud Run → AWS

このガイドでは、**長期 AWS アクセスキーや Google service-account key file を保存せず**、Cloud Run の Workload Identity から SigV4 保護された AWS HTTP endpoint を呼び出すまでを設定します。

AssumeKit 自体はクラウドリソースを自動作成しません。IAM の trust boundary を運用者が確認できるよう、設定を明示的に分けています。

> 現在は early alpha で、まだ npm には公開していません。ここで説明する構成を最初の実 Cloud Run → AWS E2E に使用する予定です。

## 構成

```text
Cloud Run revision
  └─ 専用 Google service account
       └─ audience を固定した Google ID token
            └─ AWS STS AssumeRoleWithWebIdentity
                 └─ 一時 AWS Credential
                      └─ SigV4 署名済み AWS request
```

AWS 側では、次の2種類のポリシーを分けて考えます。

1. **Role trust policy** — どの Google workload が Role を引き受けられるか。
2. **Role permissions policy** — Role を引き受けた後、AWS 上で何を実行できるか。

## 前提

- Google Cloud project と Cloud Run service がある。
- Cloud Run に user-managed service account を作成・設定できる。
- AWS IAM Role を作成・更新できる。
- 呼び出したい SigV4 保護 AWS endpoint がある。
- アプリの runtime は Node.js 22+。

以下の `gcloud` / AWS CLI は**初期設定用**です。Cloud Run の runtime に CLI を入れる必要はありません。

## 1. 秘密情報ではない設定値を決める

```bash
export GCP_PROJECT_ID="example-project"
export GCP_REGION="asia-northeast1"
export CLOUD_RUN_SERVICE="example-service"
export GCP_SERVICE_ACCOUNT_NAME="assumekit-runtime"

export AWS_REGION="ap-northeast-1"
export AWS_ROLE_NAME="AssumeKitExample"
export ASSUMEKIT_AUDIENCE="assumekit-prod-example"
```

### audience の決め方

audience はパスワードではなく、**その Google ID token をどの trust relationship 向けに発行したかを固定する識別子**です。

同じ値を次の2か所で使います。

- `gcpMetadataIdentity({ audience })`
- AWS trust policy の `accounts.google.com:oaud`

`assumekit-prod-orders-api` のように、環境・Role単位で区別できる値を推奨します。無関係な workload 間で同じ汎用 audience を共有しない方が安全です。

## 2. 専用 Google service account を作る

```bash
gcloud iam service-accounts create "$GCP_SERVICE_ACCOUNT_NAME" \
  --project "$GCP_PROJECT_ID" \
  --display-name "AssumeKit runtime"

export GCP_SERVICE_ACCOUNT_EMAIL="${GCP_SERVICE_ACCOUNT_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
```

AWS trust policy に使う stable numeric unique ID を取得します。

```bash
export GCP_SERVICE_ACCOUNT_UNIQUE_ID="$(
  gcloud iam service-accounts describe "$GCP_SERVICE_ACCOUNT_EMAIL" \
    --project "$GCP_PROJECT_ID" \
    --format='value(uniqueId)'
)"

printf '%s\n' "$GCP_SERVICE_ACCOUNT_UNIQUE_ID"
```

AWS trust policy では **service-account email ではなく numeric unique ID** を使います。

AssumeKit のために Google service-account key を作る必要はありません。鍵ファイルは作らない方針がこの構成の前提です。

## 3. Cloud Run に service identity を設定する

既存 service の場合:

```bash
gcloud run services update "$CLOUD_RUN_SERVICE" \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --service-account "$GCP_SERVICE_ACCOUNT_EMAIL"
```

新規 deploy 時は `gcloud run deploy` の `--service-account` でも設定できます。

デプロイ実行者には service account を attach/use する権限が必要です。一方、runtime service account に AssumeKit のためだけの広い GCP Role を追加しないでください。アプリ本体に必要な GCP 権限だけを付与します。

## 4. AWS IAM Role の trust policy を作る

このフローでは Google が AWS の built-in federated principal として扱われるため、`accounts.google.com` 用の custom IAM OIDC provider を別途作る必要はありません。

```bash
cat > /tmp/assumekit-trust.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "accounts.google.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "accounts.google.com:aud": "${GCP_SERVICE_ACCOUNT_UNIQUE_ID}",
          "accounts.google.com:oaud": "${ASSUMEKIT_AUDIENCE}",
          "accounts.google.com:sub": "${GCP_SERVICE_ACCOUNT_UNIQUE_ID}"
        }
      }
    }
  ]
}
EOF
```

Role 新規作成:

```bash
aws iam create-role \
  --role-name "$AWS_ROLE_NAME" \
  --assume-role-policy-document file:///tmp/assumekit-trust.json
```

既存 Role の trust policy を更新する場合:

```bash
aws iam update-assume-role-policy \
  --role-name "$AWS_ROLE_NAME" \
  --policy-document file:///tmp/assumekit-trust.json
```

`aud` / `oaud` / `sub` の対応関係は [GCP → AWS trust policy](gcp-aws-trust.ja.md) で説明しています。

## 5. AWS Role に最小権限を付ける

trust policy は「Roleを引き受けてよい workload」を決めるだけで、対象AWSサービスへの操作権限は付与しません。

呼び出す endpoint に必要な permissions policy を最小権限で付与します。たとえば API Gateway の IAM 認証 API であれば、通常は対象 API / stage / method / resource に絞った `execute-api:Invoke` を検討します。`AdministratorAccess` を付ける理由にはなりません。

形だけの例:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "execute-api:Invoke",
      "Resource": "arn:aws:execute-api:<AWS_REGION>:<AWS_ACCOUNT_ID>:<API_ID>/<STAGE>/<METHOD>/<RESOURCE>"
    }
  ]
}
```

## 6. アプリを設定する

推奨 environment variables:

```dotenv
AWS_ROLE_ARN=arn:aws:iam::<AWS_ACCOUNT_ID>:role/AssumeKitExample
AWS_REGION=ap-northeast-1
AWS_SERVICE=execute-api
AWS_OIDC_AUDIENCE=assumekit-prod-example
```

`AWS_ROLE_ARN` と audience は credential ではありません。このフローのために `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / Google private key / ID token / STS session token を保存しないでください。

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

if (!response.ok) {
  throw new Error(`AWS request failed: ${response.status}`);
}
```

`service` は AWS の SigV4 signing name です。製品名と一致するとは限りません。API Gateway IAM auth は `execute-api` です。他サービスは AWS 公式ドキュメントで signing name を確認してください。

## 7. Cloud Run に設定を反映する

```bash
gcloud run services update "$CLOUD_RUN_SERVICE" \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --service-account "$GCP_SERVICE_ACCOUNT_EMAIL" \
  --update-env-vars "AWS_ROLE_ARN=arn:aws:iam::<AWS_ACCOUNT_ID>:role/${AWS_ROLE_NAME},AWS_REGION=${AWS_REGION},AWS_SERVICE=execute-api,AWS_OIDC_AUDIENCE=${ASSUMEKIT_AUDIENCE}"
```

実 token や temporary credential を environment variable にコピーしないでください。

## 8. 実環境で確認する

AWS 呼び出しを1回だけ行う application path を実行し、段階ごとに確認します。

1. Cloud Run revision が意図した service account で動いている。
2. metadata server から Google ID token を取得できる。
3. AWS CloudTrail に対象 Role の `AssumeRoleWithWebIdentity` が記録される。
4. 対象 AWS request が Role permissions policy により許可される。
5. application log に Google ID token / temporary AWS credential が出ていない。

CIやunit testが成功していても、この real-cloud E2E の代わりにはなりません。

## ローカル開発

`gcpMetadataIdentity()` は Google metadata server を利用するため、通常のローカルPCでは動作しません。これは想定仕様です。

unit test では `WorkloadIdentityProvider` をテスト用に差し替えられます。ローカル開発を楽にするためだけに、production codeへ長期 Google/AWS key の自動fallbackを入れることは推奨しません。

## 次に読むもの

- [GCP → AWS trust policy](gcp-aws-trust.ja.md)
- [セキュリティモデル](security-model.ja.md)
- [トラブルシューティング](troubleshooting.ja.md)

## 公式リファレンス

- AWS Security Blog — Access AWS using a Google Cloud Platform native workload identity: https://aws.amazon.com/blogs/security/access-aws-using-a-google-cloud-platform-native-workload-identity/
- AWS IAM — Google federation condition keys: https://docs.aws.amazon.com/ja_jp/IAM/latest/UserGuide/reference_policies_iam-condition-keys.html
- AWS IAM — STS Regions/endpoints: https://docs.aws.amazon.com/ja_jp/IAM/latest/UserGuide/id_credentials_temp_region-endpoints.html
- Google Cloud Run — service identity: https://cloud.google.com/run/docs/securing/service-identity?hl=ja
- Google Cloud Run — service identity configuration: https://cloud.google.com/run/docs/configuring/services/service-identity?hl=ja

# GCP → AWS trust policy

AssumeKitはIAM Roleを自動provisionしません。AWS STS `AssumeRoleWithWebIdentity` を使い、**意図したGoogle service accountだけ**がRoleを取得できるtrust policyを設定します。

このフローではGoogleがAWSのbuilt-in federated principalとしてサポートされるため、`accounts.google.com` 用のcustom IAM OIDC providerを別途作る必要はありません。

## Google service-account unique IDを取得する

production ID tokenをdecodeしてログへ出すより、Google Cloud API/CLIからstable numeric IDを取得する方法を推奨します。

```bash
GCP_SERVICE_ACCOUNT_EMAIL="assumekit-runtime@example-project.iam.gserviceaccount.com"

gcloud iam service-accounts describe "$GCP_SERVICE_ACCOUNT_EMAIL" \
  --project "example-project" \
  --format='value(uniqueId)'
```

AWS trust conditionにはservice-account emailではなく、このnumeric unique IDを使います。

## audienceを決める

audienceは秘密情報ではありません。対象workload/Role専用のstableな値を推奨します。

```text
assumekit-prod-orders-api
```

完全に同じ値を次の2か所へ設定します。

- `gcpMetadataIdentity({ audience: "..." })`
- AWS trust policy の `accounts.google.com:oaud`

可能であれば、無関係な複数trust relationshipで1つの汎用audienceを共有しないでください。

## 推奨trust policy

```json
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
          "accounts.google.com:aud": "<GOOGLE_SERVICE_ACCOUNT_UNIQUE_ID>",
          "accounts.google.com:oaud": "<ASSUMEKIT_AUDIENCE>",
          "accounts.google.com:sub": "<GOOGLE_SERVICE_ACCOUNT_UNIQUE_ID>"
        }
      }
    }
  ]
}
```

## `aud` / `oaud` / `sub` の意味

Google ID tokenに `azp` (authorized party) がある場合、AWS condition keyは次のようにmappingされます。

- `accounts.google.com:aud` ← Google token `azp`
- `accounts.google.com:oaud` ← Google token `aud`
- `accounts.google.com:sub` ← Google token `sub`

このworkload-identity flowのGoogle service-account ID tokenでは、`azp` / `sub` がservice account identity、`aud` がmetadata serverへ要求したaudienceになります。

3条件を固定することでRoleを、

1. 意図したGoogle service account
2. 意図したAssumeKit trust relationship向けにmintされたtoken

の両方へ絞ります。

conditionなしで `accounts.google.com` 全体を信頼するのは広すぎます。

## Role作成・更新

AWS Console / IaC / AWS CLIのどれでも構いません。CLI例:

```bash
aws iam create-role \
  --role-name AssumeKitExample \
  --assume-role-policy-document file://trust-policy.json
```

既存Role:

```bash
aws iam update-assume-role-policy \
  --role-name AssumeKitExample \
  --policy-document file://trust-policy.json
```

AWS CLIは初期provision用であり、Cloud Run runtimeには不要です。

## Trust policy と permissions policy は別

trust policyはGoogle workloadがRole sessionを取得できるかを決めます。対象AWS APIを操作する権限は付与しません。

Roleには別途、対象action/resourceだけに絞ったleast-privilege permissions policyを付けてください。

対象AWS serviceで `AccessDenied` が出たからといってtrust policyを広げず、STS段階とtarget service段階を分けて診断します。

## Cloud Run identity

Cloud Run serviceには専用user-managed service accountをattachします。AssumeKitはmetadata serverからshort-lived Google-signed ID tokenを取得するため、Google service-account key fileは不要です。

metadata tokenは `format=standard` で要求し、AWS STSに不要なproject/instance detailを含めない構成です。

## AWS STS endpoint

AssumeKitは `region` からRegional AWS STS endpointを導出します。AWSも可能な場合はRegional STSを推奨しています。

public APIから任意STS URLを指定できないようにし、metadata / STS requestはredirectを追従しません。

## Privacy / logging

`AssumeRoleWithWebIdentity` はAWS CloudTrailへ記録されます。Role session nameやidentity-related fieldがaudit eventへ現れる可能性があります。

- PIIではなくworkload identifierを使う。
- Google ID token / temporary AWS credentialをログ出力しない。
- claim mismatchの調査でもproduction tokenをpublic issueへ貼らない。

## 公式リファレンス

- AWS Security Blog: https://aws.amazon.com/blogs/security/access-aws-using-a-google-cloud-platform-native-workload-identity/
- AWS IAM condition keys: https://docs.aws.amazon.com/ja_jp/IAM/latest/UserGuide/reference_policies_iam-condition-keys.html
- AWS STS regions/endpoints: https://docs.aws.amazon.com/ja_jp/IAM/latest/UserGuide/id_credentials_temp_region-endpoints.html
- Google service-account `uniqueId`: https://cloud.google.com/iam/docs/reference/rest/v1/projects.serviceAccounts
- Cloud Run service identity: https://cloud.google.com/run/docs/securing/service-identity?hl=ja

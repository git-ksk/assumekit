# セキュリティポリシー

[English](SECURITY.md)

AssumeKit は workload identity federation と一時 AWS Credential を扱う認証ライブラリです。脆弱性報告や不具合調査では、認証情報や本番環境の識別情報を公開しないことを最優先にしてください。

## 脆弱性の報告

次の情報を含む public Issue は作成しないでください。

- AWS access key / secret access key
- Google ID token
- AWS STS temporary credential / session token
- private key / service-account key file
- 本番 AWS account ID
- private な Role ARN
- service-account email など、公開不要な環境識別情報
- 顧客情報・個人情報
- 未修正の脆弱性をそのまま悪用できる詳細手順

この repository で GitHub Private Vulnerability Reporting が利用できる場合は、そちらを使用してください。

Private Vulnerability Reporting が利用できない場合は、機密情報を含めず「非公開で連絡したい」旨だけを最小限の public Issue として投稿してください。安全な連絡経路が確立する前に、再現用 token、credential、production identifier、exploit detail を貼らないでください。

## セキュリティモデル

AssumeKit は、長期 AWS access key や Google service-account key file を保存せず、workload identity federation から短期 credential を取得する設計です。

ただし、安全性はライブラリだけでは決まりません。少なくとも次が必要です。

- Assume対象の AWS Role を用途ごとに狭く分離する
- IAM trust policy で意図した workload identity と audience を固定する
- Role permissions policy を least privilege にする
- identity token と temporary credential をログへ出さない
- `sessionName` に人名、メール、顧客IDなど不要なPIIを入れない
- dependency / GitHub Actions / release pipeline の supply-chain controls を保つ
- 実行環境自体の侵害やSSRF等を別レイヤーで防御する

詳細な境界と非対応範囲は [セキュリティモデル](docs/security-model.ja.md) を参照してください。

## Credential の保持

AssumeKit が取得した temporary AWS Credential は process memory 内だけに cache されます。ライブラリ自身が file、database、environment variable 等へ永続化することはありません。

Google ID token も credential exchange に使用するための短期値として扱い、永続保存を前提にしません。

## Network boundary

- Google identity token は GCP provider が組み立てる Google metadata identity endpoint からのみ取得します。
- metadata request は redirect を追従しません。
- public API は任意 STS endpoint を受け付けず、設定された AWS region から Regional STS endpoint を導出します。
- STS request は HTTPS を使用し、redirect を追従しません。
- credential acquisition には bounded timeout / bounded retry を使用します。
- SigV4 署名済み AWS service request は automatic retry `0` が default です。非冪等操作の意図しない再送を避けるためです。

## IAM trust policy

Google federation では `accounts.google.com` を無条件に信頼しないでください。

AssumeKit の GCP → AWS 構成では、service account の stable numeric unique ID と workload/Role 用 audience を条件に固定します。設定方法は [GCP → AWS trust policy](docs/gcp-aws-trust.ja.md) を参照してください。

`AccessDenied` を解消する目的で `aud` / `oaud` / `sub` 条件を削除することは推奨しません。

## Retry

Credential取得の retry と、AWS service call の retry は別物です。

- metadata / STS: 一時的な network error / retryable status に対する限定retry
- AWS service call: default `0`

`retries` を有効にする場合は、対象requestが再送可能かを呼び出し側で判断してください。特に POST、MCP tool call、状態変更APIは二重実行の可能性があります。

## Logging

次の値を application log、trace、error report、public Issue、CI outputへ出さないでください。

- Google ID token 全文
- AWS temporary access key / secret / session token
- Authorization header
- SigV4署名済みrequestの機密header
- private key material

AWS Role ARNやaccount IDも必ずしもsecretではありませんが、public repositoryやIssueへ本番値を載せる必要はありません。exampleではplaceholderを使用してください。

## サポート対象バージョン

最初の stable release までは、最新の `main` のみをサポート対象とします。

pre-1.0 の間は、セキュリティ修正のために public API を変更する場合があります。

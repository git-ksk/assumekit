# トラブルシューティング

AssumeKit の認証・通信は3段階に分かれています。IAM policy を変更する前に、どこで失敗したかを切り分けます。

```text
1. GCP metadata token 取得
2. AWS STS AssumeRoleWithWebIdentity
3. SigV4 保護された AWS service request
```

## まず見る表

| 症状 | 失敗箇所 | 最初に確認するもの |
| --- | --- | --- |
| `allowedHosts must contain at least one HTTPS request host` | ローカル設定 | scheme/pathを含まない信頼済みhostを1件以上指定したか |
| `AWS request host is not allowed` | request validation | request URLのhostが `allowedHosts` と完全一致しているか。任意入力を通すためにallowlistを広げない |
| `AWS request target must use HTTPS` | request validation | HTTPS endpointだけを使用する |
| redirect関連のfetch error | AWS service | final canonical HTTPS endpointを使用する。signed service redirectは意図的に拒否される |
| service request abort/timeout | AWS service | callerが渡した `AbortSignal` deadlineとtarget/network healthを確認する |
| `Failed to obtain GCP identity token` | GCP metadata | 本当にCloud Run/Google Cloud上で、意図したservice accountが付いているか |
| metadata timeout | GCP metadata | runtime環境、metadata access、`serviceAccount` override |
| STS `InvalidIdentityToken` | AWS STS | audience と trust policy の claim mapping |
| STS `AccessDenied` | AWS STS | Role trust policy / role ARN |
| AWS側 `403` / `AccessDenied` | AWS service | Role permissions policy |
| `SignatureDoesNotMatch` | AWS service | SigV4 `service` / region / endpoint |
| `RegionDisabledException` | AWS STS | 選択リージョンでのSTS利用可否 |
| Cloud Run E2E revisionがhealthyにならない | Release E2E | Cloud Run logsを確認。AWS request成功までは `$PORT` をlistenしない設計 |

## 署名先validation

### `allowedHosts must contain at least one HTTPS request host`

`allowedHosts` は必須です。各entryにはhost名と必要ならportだけを指定します。

```ts
allowedHosts: ["example.execute-api.ap-northeast-1.amazonaws.com"]
```

`https://`、path、query、fragment、URL credentialは含めません。

信頼済み設定のendpointからhostを導出する形が扱いやすく安全です。

```ts
const endpoint = new URL(process.env.AWS_ENDPOINT!);
const awsFetch = createAwsFetch({
  // ...
  allowedHosts: [endpoint.host],
});
```

### `AWS request host is not allowed`

request URLの `host` がallowlistと完全一致していません。このvalidationはworkload credential取得前に走るため、不正な送信先でGoogle token取得やAWS STS交換が始まらない設計です。

確認項目:

- subdomainが違っていないか。
- portの有無・値が違っていないか。
- 明示的に信頼していない別endpointを呼んでいないか。

任意user inputを通すためにhostを追加しないでください。`allowedHosts` はcredential pathの制約であり、HTTP method・path・query・payloadへのapplication-level authorizationの代わりではありません。

### `AWS request target must use HTTPS`

署名付きAWS service requestはHTTPSだけを許可します。HTTP targetはcredential取得前にrejectされます。

## GCP metadata

### Cloud Runでは動くがローカルでは動かない

想定仕様です。`gcpMetadataIdentity()` は Google metadata server を使います。通常のローカルPCからこのmetadata serverを使う設計ではありません。

unit test では test 用 `WorkloadIdentityProvider` を注入してください。

### metadata server が `404` / `403`

確認項目:

- Cloud Run revision に意図した service account が設定されている。
- `gcpMetadataIdentity({ serviceAccount })` を使っているなら値が正しい。
- application code が metadata request を独自に書き換えていない。

AssumeKit は必要な `Metadata-Flavor: Google` header を付与し、redirect は追従しません。

### metadata timeout

デフォルトは1試行3秒＋bounded retryです。timeoutを伸ばす前に、Google metadata serverを使えるruntimeで実行しているかを確認してください。

## AWS STS

### `InvalidIdentityToken`

多くは Google token と AWS trust condition の不一致です。

Google service-account ID token に `azp` がある場合、AWS condition key との対応は次です。

- `accounts.google.com:aud` ← Google `azp`
- `accounts.google.com:oaud` ← Google `aud`
- `accounts.google.com:sub` ← Google `sub`

AssumeKit推奨構成では `azp` / `sub` が service account の numeric unique ID、`oaud` が `gcpMetadataIdentity()` に渡した audience と一致する必要があります。

production ID token をログへ出して確認するのではなく、service-account unique ID は `gcloud iam service-accounts describe ... --format='value(uniqueId)'` で取得してください。

### STS `AccessDenied`

AWSがrequestを認識したものの、Role trust relationshipが許可していない場合が中心です。

- `roleArn` が正しいaccount/roleを指している。
- `Principal.Federated` がこのGoogle built-in flowでは `accounts.google.com`。
- Actionが `sts:AssumeRoleWithWebIdentity`。
- `aud` / `oaud` / `sub` が完全一致している。

解決のためにconditionを外して `accounts.google.com` 全体を信頼するのは避けてください。

### `RegionDisabledException`

AssumeKitはRegional STSを使います。特にopt-in regionの場合、選択したregionでSTSが利用可能か確認してください。

### STS timeout / 一時的な5xx・429

Credential取得だけはbounded full-jitter retryします。上限なしretryにはしないでください。

## AWS service request

### 対象AWS serviceが `AccessDenied`

STS成功後に対象サービスだけ拒否される場合、主に**Role permissions policy**の問題です。

- trust policy = 誰がRoleを取得できるか
- permissions policy = 取得したRoleで何ができるか

を分けて確認します。

### redirect関連のfetch error

AssumeKitはsigned AWS service requestに `redirect: "error"` を強制します。callerが `redirect: "follow"` を渡してもredirectは追従しません。

最終canonical AWS HTTPS endpointを直接指定してください。最初にallowlist検証したdestinationの外へsigned requestがredirectで移動する経路を残さないための仕様です。

### service request deadline / timeout

metadata / STS credential取得にはbuilt-in timeoutがありますが、application service requestすべてに一律timeoutは適用しません。deadlineが必要なら `signal` を渡します。

```ts
await awsFetch(endpoint, {
  signal: AbortSignal.timeout(15_000),
});
```

対象operationとworkloadに合うtimeoutを選んでください。遅い・到達不能なendpointを隠すために上限を全部外すのは避けてください。

### `SignatureDoesNotMatch`

確認項目:

- `region` がendpoint/operationと一致している。
- `service` が対象AWSサービスのSigV4 signing nameになっている。
- URLが実際に送信するURLと一致している。
- 署名後にmiddleware等がrequestを書き換えていない。
- runtime clockに大きなズレがない。

API Gateway IAM auth の signing service は `execute-api` です。

### POSTが二重実行されるのが心配

AssumeKitはAWS service callのretryをデフォルト `0` にしています。MCP POSTなど非冪等requestを自動再送しないためです。

`retries > 0` を明示する場合は、対象operationが再実行可能か、idempotency mechanismがあることを利用者側で確認してください。

## Release E2E

release E2Eは実Cloud Run **Service** revisionで動かします。コピペ可能なdeploy・確認・cleanup手順は [Cloud Run E2E runbook](cloud-run-e2e.ja.md) を参照してください。

### `K_SERVICE` error

Cloud Run Service revision内でsmoke commandが動いていません。ローカルPCではrelease gateを満たせないよう意図的に失敗します。

### `Cannot find ... dist/index.js`

Cloud Run imageはrepository rootからbuildしてください。projectは `gcp-build` でimage build時に `dist/` を生成し、runtimeのsmoke commandではTypeScript compileを行いません。

### revisionがhealthyにならない

identity chainまたはAWS smoke requestが失敗した場合は想定動作です。E2E processは署名付きAWS request成功後にだけ `0.0.0.0:$PORT` でlistenするため、Cloud Run deployment health check自体がrelease gateの一部になります。

まずService logsを確認し、local validation / metadata / STS / redirect・timeout / AWS serviceのどこで失敗したかを切り分けてください。起動だけ通すためにhealth挙動を無効化したりIAMを緩めたりしないでください。

## Credential refresh

Temporary AWS credential はメモリだけにcacheし、期限前にrefreshします。同時requestは1つのin-flight refreshを共有します。

Cloud Run instanceが再起動・scale downすればcacheは消え、次回requestで新しいcredentialを取得します。永続credentialを残さないための想定動作です。

## 安全なdebug

通常ログに出してよいもの:

- provider名 (`gcp-metadata`)
- AWS region
- SigV4 service名
- HTTP status / AWS error code
- PIIを含まないcorrelation ID

出さないもの:

- Google ID token
- production JWT payload
- AWS access key / secret access key / session token
- Authorization header
- customer data

`sessionName` やidentity関連情報はCloudTrailに記録され得ます。人名、メールアドレス、顧客IDなどを `sessionName` に入れないでください。

## Public issueを作る場合

載せてよい情報:

- Node.js version
- AssumeKit version/commit
- AWS region / SigV4 service name
- sanitize済みerror code/status
- placeholderだけを使った最小再現

実token、credential、顧客payload、個人情報、組織内で機密扱いしているARN/メール等は載せないでください。

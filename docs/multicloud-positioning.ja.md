# マルチクラウド向けプロダクトポジショニング

AssumeKit は、薄い **multi-cloud workload identity → constrained AWS access bridge** です。

AWS 外部で動く production workload から、長期 AWS access key や cloud provider の private-key file を配布せずに、SigV4 保護された AWS endpoint を呼び出すことを目的とします。

安定させるプロダクト形は次です。

```text
external workload identity
  → AWS STS AssumeRoleWithWebIdentity
  → temporary AWS credentials
  → constrained SigV4 fetch
```

AssumeKit は新しい federation protocol を発明しません。標準の federation primitive を使う際に残る identity acquisition、credential lifecycle、request boundary の glue を減らすことが価値です。

## Cloud Run は最初の reference path であり、恒久的な product boundary ではない

最初の production-supported path を Google Cloud Run → AWS にするのは、具体的な cross-cloud workload であり、次の application-side composition が実際に残っているためです。

- Google runtime identity の取得
- AWS STS `AssumeRoleWithWebIdentity`
- temporary credential の cache / refresh
- SigV4 request signing
- request destination の制約
- redirect / retry / timeout / logging の安全性

この経路を完全に仕上げることで、より広い architecture に対する最初の real-cloud reference implementation を作ります。

追加 identity provider は、それぞれ real-cloud evidence を持つまで production support を表明しません。

## AssumeKit が目指さないもの

AssumeKit は意図的に次を目指しません。

- AWS SDK replacement
- AWS service client framework
- generic multi-source credential chain
- static access-key compatibility layer
- cloud secret manager
- IAM Role / Policy provisioner
- provider 数を増やすこと自体を目的とした federation framework
- sidecar / credential-broker daemon

目的は AWS credential の種類を増やすことではありません。workload platform が利用可能な短期 identity を既に提供しているなら、長期 AWS credential の配布そのものを避けることです。

## 安定させる architecture boundary

一般化する軸は **workload identity source** です。

AWS-facing contract は小さく保ちます。

```ts
createAwsFetch({
  identity,
  roleArn,
  region,
  service,
  allowedHosts,
});
```

将来 provider が増えても変わるのは `identity` の取得方法であり、AWS-facing API を generic credential abstraction や service-client abstraction に広げません。

概念的には次の形です。

```text
Google Cloud Run identity ─┐
Azure workload identity ───┼─> WorkloadIdentityProvider
Kubernetes identity ────────┤
other qualified identity ───┘
                              ↓
                    AWS STS web identity
                              ↓
                     temporary credentials
                              ↓
                    constrained SigV4 fetch
```

## Security property は product property

次は単なる実装詳細ではなく、プロダクト境界の一部として扱います。

- Regional AWS STS
- 通常 public API から caller-supplied の任意 STS endpoint を指定させない
- short-lived identity と temporary AWS credentials
- credential を永続化しない
- identity / STS acquisition を bounded にする
- safe redirect behavior
- exact signed-host allowlist
- AWS service-call retry default `0`
- safe error / logging
- support claim 前の provider-specific real-cloud evidence

これらを維持できない provider を、platform coverage を増やす目的だけで追加しません。

## 競合との境界

federation が技術的に可能という理由だけで provider lane に入らないようにします。

provider 追加前に、その platform の成熟した first-party / official AWS integration と必ず比較します。

次のいずれかに意味のある gap が残る場合だけ候補にします。

- fetch-native integration
- runtime identity acquisition
- temporary credential lifecycle
- security-boundary enforcement
- conservative request behavior
- application 側で繰り返し再実装される glue

公式 integration が production workload を end-to-end で十分に解決している場合、具体的な未解決 runtime use case が示されない限り AssumeKit は defer します。

GitHub Actions OIDC は代表例です。GitHub → AWS には成熟した first-party integration があるため、自動的な拡張先にはしません。

## Provider 選定 policy

post-v0.1 の provider work は checklist-driven ではなく、demand / gap-driven にします。

実装開始前に candidate は少なくとも次を満たす必要があります。

1. AWS 外の具体的な production workload が AWS access を必要としている。
2. platform が長期 private key を要求せず short-lived workload identity を提供する。
3. first-party / official AWS integration を確認済み。
4. 意味のある integration / security gap が残る。
5. generic credential chain にならず AssumeKit が gap を埋められる。
6. identity acquisition source を固定または厳密に制約できる。
7. failure handling を bounded かつ安全に保てる。
8. real-cloud E2E 環境を用意できる。
9. 対象 use case が通常の request/response 型 SigV4 fetch に収まる。

Issue #16 でこの判定基準を管理し、Issue #18 で post-v0.1 candidate comparison を管理します。

## v0.1 後の candidate lane

調査候補:

- Azure workload identity / managed identity → AWS
- Kubernetes projected service-account identity → AWS
- Cloudflare Workers 等の edge runtime。ただし適切な short-lived workload identity path が実際に存在し、provider contract を満たせる場合のみ

これらは候補であり commitment ではありません。

次 provider は Cloud Run path を証明し、初回 npm alpha を公開した後にだけ選定します。

## 直近の優先順位

multi-cloud positioning を定義しても **v0.1 の scope は広げません**。

現在の順序は維持します。

1. #5 の実 Cloud Run → AWS release-gate E2E を完了する。
2. 既存 release process で初回 npm alpha を公開する。
3. Cloud Run → AWS を最初の reference implementation として記録する。
4. #16 / #18 を使って post-v0.1 provider candidate を比較する。
5. 次 provider は最大 1 つだけ選ぶ。
6. production support を表明する前に provider-specific real-cloud evidence を必須にする。

## Product statement

AssumeKit の意図を短く表現すると次です。

> Platform が元々持っている workload identity を使い、長期 AWS key を配布せず、短期 AWS access と constrained SigV4 `fetch()` へ交換する。

さらに短く表すなら:

> Multi-cloud workload identity in. Temporary, constrained AWS access out.

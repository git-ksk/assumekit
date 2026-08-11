# Roadmap / compatibility contract

AssumeKit は意図的にscopeを狭く保つプロジェクトです。新しいfederation protocol、IAM provisioner、secret manager、AWS SDK credential provider全体の代替を目指しません。

application-facingな役割は次です。

```text
external workload identity
  → AWS STS AssumeRoleWithWebIdentity
  → temporary AWS credentials
  → constrained SigV4 fetch
```

基礎となるfederation mechanism自体は標準技術です。AssumeKitの価値は、その一連の経路を保守的なdefault、credential lifecycle管理、明示的なsecurity boundaryとともに小さなfetch-oriented APIへまとめることです。

## v0.1: まず1経路を完全に仕上げる

初回releaseは Google Cloud Run → AWS に集中します。

release条件:

- #5で管理している実Cloud Run → AWS release-gate E2Eを通し、証跡を記録する。
- gate通過前に初回npm alphaを公開しない。
- v0.1のproduction identity providerはGoogle metadata identityだけにする。
- Regional STS、signed-host完全一致allowlist、redirect拒否、bounded credential acquisition、service-call retry default `0` をcompatibility/security propertyとして維持する。
- static key、IAM auto-provisioning、persistent credential storage、browser auth、proxy/daemon modeはv0.1へ入れない。

## 対応するSigV4 endpointの考え方

AssumeKitは、通常のAWS SigV4 request signingを使い、最終hostを安定して指定できるHTTPS endpointを対象にします。例:

- API Gateway IAM認証endpoint (`service: "execute-api"`)
- SigV4が公式な認証方式で、signing name / regionが明確なAWS service HTTP endpoint
- AWS serviceの前段でSigV4認証されるMCP/application HTTP endpoint

Compatibilityは**AWS製品名だけから推測しません**。callerが正しいSigV4 signing `service` と `region` を指定し、最終HTTPS hostを `allowedHosts` に明示する必要があります。

既知の注意点:

- SigV4 signing nameはAWS製品名と異なる場合がある。
- redirectは拒否するため、最終canonical endpointを直接指定する。
- host allowlistはpath / method / query / payloadをauthorizationしない。
- service固有のstreaming、event-stream、WebSocket、presigning、特殊signing flowはgenericな `fetch()` contractだけでは自動対応扱いにしない。
- AWS partition/provider combinationは明示的にdocument/testしたものだけを対応扱いにし、推測で保証しない。

通常のrequest/response型SigV4 fetchを超える挙動が必要なserviceは、focused testとdocumentationでcompatibilityを確立するまでunsupportedとして扱います。

## Workload Identity Provider contract

追加identity providerは `WorkloadIdentityProvider` の背後へ実装できますが、tokenを返せるだけでproduction-supportedとは扱いません。

production providerは少なくとも次を満たす必要があります。

1. **短期workload identity** — 長期private key/static cloud secretを要求せず、platformのworkload identity mechanismからruntime identityを取得する。
2. **明示的audience / trust target** — platformが対応する場合、federation audienceまたは同等のtrust targetを明示する。
3. **固定または厳密に制約されたcredential source** — untrusted application inputで任意identity-token endpointを選択できない。
4. **unsafe redirectなし** — credentialを含むnetwork requestで別destinationへのredirectを黙って追従しない。
5. **bounded acquisition** — finite timeoutと、適切なtransient failureだけへのbounded retryを使う。
6. **credentialを永続化しない** — providerの都合でidentity tokenやAWS temporary credentialを保存しない。
7. **安全なerror/logging** — live token、private key、temporary credential、Authorization headerを通常error/logへ含めない。
8. **failure modeをtest可能にする** — malformed config、identity endpoint unavailable、retry limit、transient failure後の回復をtestする。
9. **support claim前にreal-cloud evidence** — provider-specific E2Eを通すまではproduction-supportedとdocumentしない。

identity sourceを増やしても、AWS-facingな `createAwsFetch()` contractはできるだけ安定させます。

## post-v0.1 provider方向性

一般化するのは**identity source**であり、AWS-facing APIを膨らませることではありません。実需要と信頼できるE2E環境がある場合だけproviderを追加します。

暫定優先順:

1. GitHub Actions OIDC
2. provider contractをきれいに満たせるAzure workload identity / managed identity
3. Kubernetes projected service-account token / workload identity
4. 同等のsecurity propertyとreal E2E evidenceを持つその他provider

これは方向性であり、release時期の約束ではありません。

## 明示的なnon-goal

AssumeKitを次の方向へ広げません。

- static AWS access-key fallback
- Google service-account JSON key loader
- IAM Role/Policy provisioner
- generic secret manager
- persistent credential storage
- browser credential library
- AWS SDK service client全体の広範な代替
- scopeを明示的に再検討しないままsidecar/proxy/daemonへ拡張

これらのboundaryを大きく変える場合は、実装PRより先にIssueでscopeとthreat modelを議論します。

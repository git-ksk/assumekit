# 競合との境界: IAM Roles Anywhere と native workload identity

AssumeKit は、AWS IAM Roles Anywhere、Vault、SPIFFE/SPIRE、その他の既存 credential infrastructure が適切な環境で、それらを置き換えることを目指しません。

最も強い product lane は次です。

> platform が native な short-lived workload identity を既に提供している production workload から、長期 AWS key を配布せず、AWS のためだけに第2の credential substrate を導入せずに constrained AWS access を得る。

## IAM Roles Anywhere が強い領域

X.509 / PKI identity model を既に持つ、または明示的に採用したい環境では IAM Roles Anywhere を優先します。例:

- on-premises server / appliance
- enterprise PKI を使う workload
- HSM / TPM / PKCS#11 等で certificate / private-key lifecycle を管理する環境
- narrow な application `fetch()` より、AWS CLI / SDK 全般で広く credential compatibility が必要な環境

これらのケースで AssumeKit が優位だとは主張しません。

## AssumeKit が狙う領域

AssumeKit は、cloud-native runtime identity や projected short-lived token など、platform が既に利用可能な workload identity を提供している環境を対象にします。

その領域では、AWS を呼ぶためだけに別の credential system を追加しないことが目的です。

```text
platform-native workload identity
  → AWS STS AssumeRoleWithWebIdentity
  → temporary AWS credentials
  → constrained SigV4 fetch
```

差別化は temporary AWS credentials を取得できることだけではありません。identity acquisition、exchange、credential lifecycle、保守的な request boundary を1つの application-facing path にまとめることです。

## Product rule

federation が可能という理由だけで provider support を増やしません。

成熟した official integration だけでは残る application-side glue または security-boundary work を AssumeKit が明確に減らせる場合だけ provider を追加します。

すでに強い first-party route がある workload lane は、具体的な fetch-native / runtime gap がない限り defer します。

## GCP-first expansion rule

第2の cloud provider を実装する前に、既存の GCP metadata provider を同じ identity mechanism が使える追加 GCP runtime で検証し、coverage を広げます。

runtime validation 候補:

- Cloud Run
- Compute Engine
- intended metadata identity path を利用できる GKE environment
- applicable な Cloud Build
- applicable な Cloud Run functions / 関連 managed runtime

同じ実装を使えることと production support は別です。各 runtime は、production-supported と記載する前にそれぞれ real-cloud evidence を要求します。

この順序により provider 数や AWS-facing API を増やさず、実利用 coverage を広げられます。

## GCP 後の provider 選定

Cloud Run release gate、初回 npm alpha、GCP runtime coverage 評価を終えた後にだけ、追加 provider lane を最大1つ選びます。

候補は Azure workload identity / managed identity、Kubernetes projected service-account identity、または defensible な short-lived workload identity path を持つ edge runtime です。

実装前に Issue #16 の provider acceptance criteria と Issue #18 の research matrix を使用します。

## Decision summary

AssumeKit が競争する境界は次です。

> platform が workload に既に与えている identity を使う。それを short-lived AWS access へ交換し、AWS-facing request path を constrained に保つ。長期 AWS key を追加せず、利用可能な native identity があるのに PKI や credential broker を新たに導入しない。

# GCP → AWS trust policy

AssumeKit does not provision IAM roles. Configure an AWS role that trusts only the intended Google service account through AWS STS `AssumeRoleWithWebIdentity`.

AWS supports Google as a built-in federated principal for this flow, so you do not need to create a custom IAM OIDC provider for `accounts.google.com`.

## Get the Google service-account unique ID

Prefer retrieving the stable numeric service-account ID through the Google Cloud API/CLI instead of decoding and logging a live production ID token.

```bash
GCP_SERVICE_ACCOUNT_EMAIL="assumekit-runtime@example-project.iam.gserviceaccount.com"

gcloud iam service-accounts describe "$GCP_SERVICE_ACCOUNT_EMAIL" \
  --project "example-project" \
  --format='value(uniqueId)'
```

Google documents `uniqueId` as the unique, stable numeric ID of the service-account resource. Use this numeric value in the AWS trust conditions rather than relying on the service-account email address.

## Choose an audience

Choose a stable, non-secret audience that is specific to the intended workload/role, for example:

```text
assumekit-prod-orders-api
```

The exact same audience must be used in:

- `gcpMetadataIdentity({ audience: "..." })`
- `accounts.google.com:oaud` in the AWS trust policy.

Do not reuse one generic audience across unrelated trust relationships when a workload-specific value is practical.

## Recommended trust policy

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

## Why `aud`, `oaud`, and `sub`?

AWS documents special claim mapping for Google ID tokens when the token has an `azp` (authorized party) claim:

- `accounts.google.com:aud` ← Google token `azp`
- `accounts.google.com:oaud` ← Google token `aud`
- `accounts.google.com:sub` ← Google token `sub`

For Google service-account ID tokens in this workload-identity flow, `azp` and `sub` identify the service account, while `aud` is the audience requested from the metadata server.

Using all three conditions binds the AWS role to both:

1. the intended Google service account; and
2. a token minted for the intended AssumeKit trust relationship.

Trusting `accounts.google.com` without claim restrictions is too broad.

## Create or update the role

You can configure the trust policy in the AWS console, IaC, or AWS CLI. Example CLI commands:

```bash
aws iam create-role \
  --role-name AssumeKitExample \
  --assume-role-policy-document file://trust-policy.json
```

For an existing role:

```bash
aws iam update-assume-role-policy \
  --role-name AssumeKitExample \
  --policy-document file://trust-policy.json
```

The AWS CLI is a provisioning convenience only. AssumeKit does not require it in the Cloud Run runtime.

## Trust policy vs permissions policy

The trust policy allows the Google workload to obtain the role session. It does not grant access to the target AWS API.

Attach a separate least-privilege permissions policy to the role for only the AWS actions/resources your workload requires.

Do not solve a target-service `AccessDenied` error by broadening the trust policy. Diagnose whether the failure is at STS or at the target AWS service first.

## Cloud Run identity

Attach a dedicated user-managed service account to the Cloud Run service. AssumeKit requests a short-lived Google-signed ID token from the metadata server; no Google service-account key file is required.

The library requests the metadata token with `format=standard`, which avoids extra project/instance details that AWS STS does not need.

## AWS STS endpoint

AssumeKit derives a Regional AWS STS endpoint from `region`. AWS recommends Regional STS endpoints where possible for resiliency and latency.

The public API intentionally does not accept an arbitrary STS URL, and metadata/STS requests do not follow redirects.

## Privacy and logging

`AssumeRoleWithWebIdentity` is visible in AWS CloudTrail. Role session names and identity-related fields can appear in audit events.

- Prefer non-PII workload/session identifiers.
- Never log Google ID tokens or AWS temporary credentials.
- Never paste production tokens into public issues to troubleshoot claim mismatches.

## Primary references

- AWS Security Blog — Access AWS using a Google Cloud Platform native workload identity: https://aws.amazon.com/blogs/security/access-aws-using-a-google-cloud-platform-native-workload-identity/
- AWS IAM — condition context keys for Google federation: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_iam-condition-keys.html
- AWS IAM — AWS STS Regions and endpoints: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp_region-endpoints.html
- Google Cloud IAM — service-account `uniqueId`: https://cloud.google.com/iam/docs/reference/rest/v1/projects.serviceAccounts
- Google Cloud Run — service identity: https://cloud.google.com/run/docs/securing/service-identity

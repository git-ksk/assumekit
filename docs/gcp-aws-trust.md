# GCP → AWS trust policy

AssumeKit does not provision IAM roles. Configure an AWS role that trusts the intended Google service account through AWS STS `AssumeRoleWithWebIdentity`.

AWS supports Google as a built-in federated principal, so this flow does not require creating a custom IAM OIDC provider for `accounts.google.com`.

## Recommended trust policy

Use values from a decoded **non-production** Google service-account ID token to fill the placeholders below. Do not paste tokens into source control or public issues.

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

For Google service-account ID tokens, Google sets `azp` and `sub` to the service account's stable numeric unique ID. AWS maps Google's claims as follows:

- `accounts.google.com:aud` ← Google token `azp`
- `accounts.google.com:oaud` ← Google token `aud`
- `accounts.google.com:sub` ← Google token `sub`

The `aud` value is the same value supplied to `gcpMetadataIdentity({ audience })`.

## Why all three conditions?

Trusting `accounts.google.com` without claim restrictions is too broad. Restricting `azp`/`sub` binds the role to the intended Google service account, while restricting `oaud` prevents a token minted for a different audience from being replayed against this role.

Use the service account's **numeric unique ID**, not its email address, for the stable identity conditions.

## Cloud Run identity

Attach a dedicated user-managed service account to the Cloud Run service. AssumeKit requests a short-lived Google-signed ID token from the metadata server; no Google service-account key file is required.

The library requests the metadata token with `format=standard`, which omits project and instance details that AWS STS does not need.

## AWS STS endpoint

AssumeKit uses the Regional AWS STS endpoint derived from the configured AWS region. This follows AWS guidance to prefer Regional STS endpoints for latency and resiliency.

## Privacy and logging

`AssumeRoleWithWebIdentity` is recorded in AWS CloudTrail and can include the token subject and role session name. Prefer stable workload identifiers rather than human PII in `sessionName`.

Never use real account IDs, role ARNs, tokens, service-account emails, or customer data in public bug reports.

## Primary references

- AWS Security Blog: "Access AWS using a Google Cloud Platform native workload identity"
- AWS IAM documentation: IAM and AWS STS condition context keys
- Google Cloud documentation: Token types / service-account ID token claims
- AWS IAM documentation: AWS STS Regional endpoints

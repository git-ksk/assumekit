# Getting started: Cloud Run → AWS

This guide configures a Cloud Run workload to access a SigV4-protected AWS HTTP endpoint without storing long-lived AWS access keys or a Google service-account key file.

AssumeKit does **not** provision cloud resources. The setup is intentionally explicit so the IAM trust boundary stays visible to the operator.

> Status: AssumeKit is early alpha and is not published to npm yet. The cloud configuration in this guide is the intended v0.1 setup and will be used for the first real end-to-end test.

## What you will configure

```text
Cloud Run revision
  └─ dedicated Google service account
       └─ Google-signed ID token (audience-scoped)
            └─ AWS STS AssumeRoleWithWebIdentity
                 └─ temporary AWS credentials
                      └─ SigV4 request to your AWS endpoint
```

There are two separate AWS policies:

1. **Role trust policy** — controls which Google workload can assume the role.
2. **Role permissions policy** — controls what the assumed role can do after STS issues credentials.

Do not treat these as interchangeable.

## Prerequisites

- A Google Cloud project with a Cloud Run service.
- Permission to create or attach a user-managed Google service account to that Cloud Run service.
- An AWS account where you can create or update an IAM role.
- A SigV4-protected AWS endpoint you intend to call.
- Node.js 22+ for the application runtime.

The CLI commands below use `gcloud` and the AWS CLI **only for provisioning**. AssumeKit does not require either CLI in the Cloud Run runtime.

## 1. Define non-secret setup values

Use your own values. The audience is not a password; it is a stable identifier that scopes where the Google ID token is intended to be used.

```bash
export GCP_PROJECT_ID="example-project"
export GCP_REGION="asia-northeast1"
export CLOUD_RUN_SERVICE="example-service"
export GCP_SERVICE_ACCOUNT_NAME="assumekit-runtime"

export AWS_REGION="ap-northeast-1"
export AWS_ROLE_NAME="AssumeKitExample"
export ASSUMEKIT_AUDIENCE="assumekit-prod-example"
```

### Choosing the audience

Use a stable, workload-specific value and keep it consistent in exactly two places:

- `gcpMetadataIdentity({ audience })`, and
- the AWS trust-policy condition `accounts.google.com:oaud`.

Prefer a value that is unique per environment/role, such as `assumekit-prod-orders-api`, rather than a generic value shared by unrelated workloads.

The audience is **not secret**. Its purpose is to reduce token replay across unintended trust relationships.

## 2. Create a dedicated Google service account

AWS recommends using a dedicated user-managed service account for this pattern instead of relying on a broad default identity.

```bash
gcloud iam service-accounts create "$GCP_SERVICE_ACCOUNT_NAME" \
  --project "$GCP_PROJECT_ID" \
  --display-name "AssumeKit runtime"

export GCP_SERVICE_ACCOUNT_EMAIL="${GCP_SERVICE_ACCOUNT_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
```

Get its stable numeric unique ID:

```bash
export GCP_SERVICE_ACCOUNT_UNIQUE_ID="$(
  gcloud iam service-accounts describe "$GCP_SERVICE_ACCOUNT_EMAIL" \
    --project "$GCP_PROJECT_ID" \
    --format='value(uniqueId)'
)"

printf '%s\n' "$GCP_SERVICE_ACCOUNT_UNIQUE_ID"
```

Use the **numeric unique ID**, not the service-account email address, in the AWS trust policy. Google documents `uniqueId` as stable for the lifetime of that service-account resource.

AssumeKit itself does not require a Google service-account key file. Do not create a key just for this integration.

## 3. Attach the identity to Cloud Run

For an existing service:

```bash
gcloud run services update "$CLOUD_RUN_SERVICE" \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --service-account "$GCP_SERVICE_ACCOUNT_EMAIL"
```

You can also set `--service-account` when deploying a new revision.

The deployment identity needs permission to attach/use the service account. The runtime service account should receive only the Google Cloud permissions the application itself needs; do not grant broad GCP roles solely for AssumeKit.

## 4. Create the AWS IAM role trust policy

Google is supported as a built-in federated principal for this AWS STS flow. You do not need to create a custom IAM OIDC provider for `accounts.google.com`.

Create a local trust-policy file:

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

Create the role:

```bash
aws iam create-role \
  --role-name "$AWS_ROLE_NAME" \
  --assume-role-policy-document file:///tmp/assumekit-trust.json
```

If the role already exists, update only its trust policy:

```bash
aws iam update-assume-role-policy \
  --role-name "$AWS_ROLE_NAME" \
  --policy-document file:///tmp/assumekit-trust.json
```

Why these three conditions are used is explained in [GCP → AWS trust policy](gcp-aws-trust.md).

## 5. Grant only the AWS permissions the workload needs

The trust policy only allows the role to be assumed. It does **not** grant access to your target AWS service.

Attach a least-privilege permissions policy for the endpoint you actually call. For example, an API Gateway IAM-authorized API commonly needs `execute-api:Invoke` scoped to the intended API/stage/method/resource, not `AdministratorAccess`.

Example shape only:

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

Use the permissions model of your target service. AssumeKit does not widen IAM permissions.

## 6. Configure the application

Recommended environment variables:

```dotenv
AWS_ROLE_ARN=arn:aws:iam::<AWS_ACCOUNT_ID>:role/AssumeKitExample
AWS_REGION=ap-northeast-1
AWS_SERVICE=execute-api
AWS_OIDC_AUDIENCE=assumekit-prod-example
```

`AWS_ROLE_ARN` and the audience are identifiers, not credentials. Never add `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, a Google private key, an ID token, or an STS session token for this flow.

Application code:

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

The `service` value is the AWS SigV4 signing name, not necessarily the marketing/product name. For API Gateway IAM authorization, it is `execute-api`. Confirm the signing name for other AWS services in that service's AWS documentation.

## 7. Deploy the Cloud Run configuration

You can set the non-secret identifiers as normal Cloud Run environment variables:

```bash
gcloud run services update "$CLOUD_RUN_SERVICE" \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --service-account "$GCP_SERVICE_ACCOUNT_EMAIL" \
  --update-env-vars "AWS_ROLE_ARN=arn:aws:iam::<AWS_ACCOUNT_ID>:role/${AWS_ROLE_NAME},AWS_REGION=${AWS_REGION},AWS_SERVICE=execute-api,AWS_OIDC_AUDIENCE=${ASSUMEKIT_AUDIENCE}"
```

Do not copy real tokens or temporary credentials into Cloud Run environment variables.

## 8. Validate the chain

Trigger an application path that makes one signed AWS request and verify the stages independently:

1. The Cloud Run revision is using the intended service account.
2. The application can obtain a Google ID token from the metadata server.
3. AWS CloudTrail records `AssumeRoleWithWebIdentity` for the intended role.
4. The target AWS request is authorized by the role permissions policy.
5. Application logs do not contain the Google ID token or AWS temporary credentials.

A successful unit/CI run is **not** a substitute for this real-cloud test.

## Local development

`gcpMetadataIdentity()` intentionally targets the Google metadata server and therefore does not work on a normal local laptop. Google documents the metadata server as available to workloads running on Google Cloud, not as a local authentication endpoint.

For unit tests, inject a test `WorkloadIdentityProvider`. Do not add a production fallback that silently reads long-lived Google or AWS keys just to make local development easier.

## Next steps

- Read [GCP → AWS trust policy](gcp-aws-trust.md) before production use.
- Read [Security model](security-model.md) for trust boundaries and non-goals.
- Use [Troubleshooting](troubleshooting.md) for metadata, STS, IAM, and SigV4 failures.

## Primary references

- AWS Security Blog — Access AWS using a Google Cloud Platform native workload identity: https://aws.amazon.com/blogs/security/access-aws-using-a-google-cloud-platform-native-workload-identity/
- AWS IAM — condition keys for Google federation: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_iam-condition-keys.html
- AWS IAM — STS Regions and endpoints: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp_region-endpoints.html
- Google Cloud Run — service identity: https://cloud.google.com/run/docs/securing/service-identity
- Google Cloud Run — configure service identity: https://cloud.google.com/run/docs/configuring/services/service-identity
- Google Cloud IAM — service account resource and `uniqueId`: https://cloud.google.com/iam/docs/reference/rest/v1/projects.serviceAccounts

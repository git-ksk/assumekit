# Release E2E: Cloud Run → AWS

This runbook executes the release-blocking identity path in a real Cloud Run **service** revision:

```text
Cloud Run service account
  → Google metadata ID token
  → Regional AWS STS AssumeRoleWithWebIdentity
  → temporary AWS credentials
  → SigV4 HTTPS request
  → configured AWS endpoint
```

Do not publish the first npm alpha until this test has passed and the evidence has been reviewed without exposing credentials or sensitive identifiers.

## Safety rules

- Use a dedicated user-managed Google service account.
- Use a narrowly scoped AWS IAM role and restrictive Google federation trust policy.
- Use a trusted, side-effect-free AWS endpoint for the smoke request. Prefer a read-only `GET` health/status endpoint.
- Keep AWS service-call retries at `0`.
- Keep the temporary Cloud Run service private; public invocation is unnecessary.
- Never put Google ID tokens, AWS temporary credentials, Authorization headers, or customer data in logs or issue comments.

## 1. Prepare values

Run these commands from a checkout of the exact `main` commit you intend to release.

```bash
export GCP_PROJECT_ID="example-project"
export GCP_REGION="asia-northeast1"
export E2E_SERVICE="assumekit-release-e2e"
export GCP_SERVICE_ACCOUNT_EMAIL="assumekit-runtime@example-project.iam.gserviceaccount.com"

export AWS_ROLE_ARN="arn:aws:iam::<AWS_ACCOUNT_ID>:role/AssumeKitExample"
export AWS_REGION="ap-northeast-1"
export AWS_SERVICE="execute-api"
export AWS_OIDC_AUDIENCE="assumekit-prod-example"
export AWS_ENDPOINT="https://example.execute-api.ap-northeast-1.amazonaws.com/health"
```

The AWS role trust policy must already pin the intended Google service-account identity and `AWS_OIDC_AUDIENCE`. See [GCP → AWS trust policy](gcp-aws-trust.md).

## 2. Deploy the temporary E2E service

From the repository root:

```bash
gcloud run deploy "$E2E_SERVICE" \
  --source . \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --service-account "$GCP_SERVICE_ACCOUNT_EMAIL" \
  --set-build-env-vars "GOOGLE_NODEJS_VERSION=24.x.x" \
  --command npm \
  --args run,e2e:cloud-run \
  --no-allow-unauthenticated \
  --set-env-vars "AWS_ROLE_ARN=${AWS_ROLE_ARN},AWS_REGION=${AWS_REGION},AWS_SERVICE=${AWS_SERVICE},AWS_OIDC_AUDIENCE=${AWS_OIDC_AUDIENCE},AWS_ENDPOINT=${AWS_ENDPOINT}"
```

Cloud Run source deployment uses Google Cloud buildpacks when the repository has no Dockerfile. The E2E command pins the buildpack runtime to Node.js 24 with `GOOGLE_NODEJS_VERSION`; this avoids relying on the package's broad npm compatibility range to choose the Cloud Run runtime. AssumeKit defines `gcp-build` so `dist/` is produced during image build, while the runtime E2E command only executes the smoke test and does not require the TypeScript compiler to remain installed.

The normal Cloud Run deployment health check is useful here: the E2E process does not listen on `0.0.0.0:$PORT` until the AWS request succeeds. A metadata, STS, signing, allowlist, redirect, timeout, or target-service failure therefore prevents the revision from becoming healthy. The final AWS smoke request is bounded to 15 seconds and signed service redirects are rejected.

## 3. Confirm the result

A successful deployment should include the application log message:

```text
Cloud Run → AWS E2E passed with HTTP 2xx.
```

Read recent service logs with:

```bash
gcloud run services logs read "$E2E_SERVICE" \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --limit 50
```

Confirm all of the following before closing the release gate:

- the revision uses the intended Google service account;
- the real metadata token request succeeded;
- Regional STS `AssumeRoleWithWebIdentity` succeeded;
- the signed HTTPS request reached only the exact configured `AWS_ENDPOINT` host;
- no service redirect was followed;
- the target returned a successful HTTP status within the bounded smoke timeout;
- no Google ID token, AWS temporary credential, or Authorization header appears in application logs;
- AWS CloudTrail shows the intended `AssumeRoleWithWebIdentity` path without an unexpected role/session identity.

Record only sanitized evidence such as commit SHA, timestamp, Cloud Run revision name, HTTP status, AWS region, and SigV4 service name.

## 4. Clean up

Delete the temporary service after recording the result:

```bash
gcloud run services delete "$E2E_SERVICE" \
  --project "$GCP_PROJECT_ID" \
  --region "$GCP_REGION" \
  --quiet
```

The E2E service is not intended to remain deployed as a production API.

## Failure diagnosis

| Symptom | Check |
| --- | --- |
| `K_SERVICE` error | The command is not running inside a Cloud Run service revision. |
| `Cannot find ... dist/index.js` | The image was not built from the repository root or the `gcp-build` step did not complete. |
| Node/buildpack version error | Confirm `GOOGLE_NODEJS_VERSION=24.x.x` is present in the build environment. |
| `AWS_ENDPOINT must use HTTPS` | Configure an HTTPS target only. |
| signed request host / `allowedHosts` error | `AWS_ENDPOINT` is not the exact trusted host expected by the smoke test. Do not widen the allowlist to arbitrary input. |
| redirect error | The target attempted to redirect. Use the final canonical AWS HTTPS endpoint instead of enabling redirect following. |
| request abort/timeout | The target did not answer within the 15-second smoke bound; inspect endpoint health/networking instead of removing the bound. |
| metadata error/timeout | Verify the revision service account and Google metadata availability. |
| STS `InvalidIdentityToken` / `AccessDenied` | Verify `aud` / `oaud` / `sub`, audience, and role ARN. Do not loosen the trust policy to make the test pass. |
| target `403` / `AccessDenied` | Verify the assumed role's permissions policy, not the federation trust policy. |
| deployment never becomes healthy | Read Cloud Run logs; the E2E intentionally delays port listening until the AWS smoke request succeeds. |

See [Troubleshooting](troubleshooting.md) for detailed stage-by-stage diagnosis.

## Primary references

- Google Cloud Run — deploy services from source: https://cloud.google.com/run/docs/deploying-source-code
- Google Cloud SDK — `gcloud run deploy`: https://cloud.google.com/sdk/gcloud/reference/run/deploy
- Google Cloud SDK — read Cloud Run service logs: https://cloud.google.com/sdk/gcloud/reference/run/services/logs/read
- Google Cloud SDK — delete a Cloud Run service: https://cloud.google.com/sdk/gcloud/reference/run/services/delete
- Google Cloud Buildpacks — Node.js: https://cloud.google.com/docs/buildpacks/nodejs

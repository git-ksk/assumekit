# Troubleshooting

AssumeKit has three distinct network/authentication stages. Identify which stage failed before changing IAM policies or retry settings.

```text
1. GCP metadata token
2. AWS STS AssumeRoleWithWebIdentity
3. SigV4-protected AWS service request
```

## Fast diagnosis

| Symptom | Likely stage | Check first |
| --- | --- | --- |
| `allowedHosts must contain at least one HTTPS request host` | Local configuration | Provide one or more exact trusted hosts, without schemes or paths. |
| `AWS request host is not allowed` | Local request validation | The requested URL host must exactly match an `allowedHosts` entry. Do not widen the allowlist for untrusted input. |
| `AWS request target must use HTTPS` | Local request validation | Use an HTTPS target only. |
| `Failed to obtain GCP identity token` | GCP metadata | Is the process actually running on Cloud Run/Google Cloud with the intended service account? |
| metadata timeout | GCP metadata | Runtime environment, metadata access, custom `serviceAccount` value |
| STS `InvalidIdentityToken` | AWS STS | audience and Google claim mapping in trust policy |
| STS `AccessDenied` | AWS STS | role trust policy and target role ARN |
| target AWS `403` / `AccessDenied` | AWS service | role permissions policy |
| `SignatureDoesNotMatch` | AWS service | SigV4 `service`, region, endpoint, request body/headers |
| `RegionDisabledException` | AWS STS | STS/Region activation for the selected Region |
| Cloud Run E2E revision never becomes healthy | Release E2E | Read Cloud Run logs; the smoke process intentionally does not listen on `$PORT` until the AWS request succeeds. |

## Signed-target validation

### `allowedHosts must contain at least one HTTPS request host`

`allowedHosts` is required. Each entry must contain only a host name and optional port, for example:

```ts
allowedHosts: ["example.execute-api.ap-northeast-1.amazonaws.com"]
```

Do not include `https://`, a path, query string, fragment, or URL credentials.

A convenient safe pattern is to derive the host from a trusted configured endpoint:

```ts
const endpoint = new URL(process.env.AWS_ENDPOINT!);
const awsFetch = createAwsFetch({
  // ...
  allowedHosts: [endpoint.host],
});
```

### `AWS request host is not allowed`

The request URL's `host` does not exactly match the allowlist. This check runs before obtaining workload credentials, so an invalid destination should not trigger Google token or AWS STS activity.

Check for:

- a different subdomain;
- a missing or unexpected port;
- accidentally using a second endpoint that was not explicitly trusted.

Do **not** solve this by adding arbitrary user-controlled hosts. `allowedHosts` constrains the credential path; it does not replace application authorization for methods, paths, query parameters, or payloads.

### `AWS request target must use HTTPS`

Signed AWS service requests are HTTPS-only. HTTP targets are rejected before credential acquisition.

## GCP metadata failures

### It works on Cloud Run but not locally

Expected. `gcpMetadataIdentity()` uses the Google metadata server. Google documents this server as available to workloads running on Google Cloud, not as a local authentication endpoint.

For unit tests, inject a test `WorkloadIdentityProvider` instead of trying to expose the production metadata endpoint to your laptop.

### `404` / `403` from the metadata server

Check:

- The Cloud Run revision has the intended service account attached.
- You did not pass an incorrect `serviceAccount` override to `gcpMetadataIdentity()`.
- The metadata request is not being manually rewritten by application code.

AssumeKit sends the required `Metadata-Flavor: Google` header and refuses redirect following.

### Metadata timeout

The default timeout is 3 seconds per attempt with a bounded retry policy. Increasing it can hide a broken runtime configuration, so first confirm the service is actually running in an environment with the Google metadata server.

## AWS STS failures

### `InvalidIdentityToken`

Most commonly, the AWS trust conditions do not match the Google token.

For a Google service-account ID token with `azp` present, AWS maps the claims as:

- `accounts.google.com:aud` ← Google `azp`
- `accounts.google.com:oaud` ← Google `aud`
- `accounts.google.com:sub` ← Google `sub`

For the intended AssumeKit setup, `azp` and `sub` should match the service account's stable numeric unique ID, and `oaud` should match the exact audience passed to `gcpMetadataIdentity()`.

Prefer obtaining the service-account unique ID with `gcloud iam service-accounts describe ... --format='value(uniqueId)'` rather than printing a live ID token into logs.

### STS `AccessDenied`

This normally means AWS recognized the request but the role trust relationship did not allow it.

Check:

- `roleArn` points to the intended role/account.
- `Principal.Federated` is `accounts.google.com` for this built-in Google flow.
- `sts:AssumeRoleWithWebIdentity` is the trusted action.
- `aud`, `oaud`, and `sub` conditions exactly match the intended Google service account and audience.

Do **not** fix this by removing the conditions and trusting all of `accounts.google.com`.

### `RegionDisabledException`

AssumeKit deliberately uses Regional STS. Verify the selected AWS Region is usable for STS in your account, particularly for opt-in Regions.

### STS timeout or transient 5xx/429

AssumeKit retries credential acquisition only, using bounded full-jitter backoff. The defaults are intentionally small. If you change them, keep the upper bound finite.

## AWS service request failures

### Target returns `AccessDenied`

If STS succeeds but the target AWS service rejects the request, the problem is usually the **role permissions policy**, not the trust policy.

The trust policy answers "who can assume the role?". The permissions policy answers "what can the assumed role do?".

### `SignatureDoesNotMatch`

Check:

- `region` matches the endpoint/operation.
- `service` is the AWS SigV4 signing name for the target service.
- The URL is the exact URL being requested.
- Application middleware is not mutating a signed request after AssumeKit signs it.
- The runtime clock is sane.

For API Gateway IAM authorization, the signing service is `execute-api`.

### The request might have been sent twice

AssumeKit defaults signed AWS service-call retries to `0` specifically to avoid replaying non-idempotent calls such as POST/MCP requests.

If you explicitly set `retries > 0`, you are responsible for ensuring that replaying the target operation is safe or protected by an idempotency mechanism.

## Release E2E failures

The release E2E intentionally runs in a real Cloud Run **service** revision. See the [Cloud Run E2E runbook](cloud-run-e2e.md) for the copy/paste deployment and cleanup commands.

### `K_SERVICE` error

The smoke command is not running inside a Cloud Run service revision. A local laptop run cannot satisfy the release gate by design.

### `Cannot find ... dist/index.js`

The Cloud Run image must be built from the repository root. The project defines `gcp-build` to produce `dist/` during the image build; the runtime smoke command does not compile TypeScript.

### Revision never becomes healthy

This is expected when the identity chain or AWS smoke request fails. The E2E process starts listening on `0.0.0.0:$PORT` only after the signed AWS request succeeds, so Cloud Run's deployment health check acts as part of the release gate.

Read the service logs first and identify whether the failure is local validation, metadata, STS, or the target AWS service. Do not disable the health behavior or loosen IAM merely to make the revision start.

## Credential refresh behavior

AssumeKit caches temporary AWS credentials in memory and refreshes them before expiration. Concurrent callers share a single in-flight refresh.

If an instance is restarted or scaled down, the cache disappears; the next request obtains new credentials. This is expected and avoids persistent credential storage.

## Safe debugging checklist

Safe to log in most environments:

- provider name (`gcp-metadata`)
- AWS region
- SigV4 service name
- HTTP status/error code
- a non-PII application correlation ID

Do not log:

- Google ID tokens
- JWT payloads from production unless you have explicitly reviewed their data content
- AWS access key ID / secret access key / session token
- full Authorization headers
- customer data

Remember that role session names and identity-related fields can appear in CloudTrail. Avoid putting human names, email addresses, or customer identifiers into `sessionName`.

## When opening a public issue

Include:

- Node.js version
- AssumeKit version/commit
- AWS region and SigV4 service name
- sanitized error code/status
- minimal reproduction with placeholder IDs

Never include a real token, account-specific secret, private role ARN if your organization treats it as sensitive, service-account email, or customer payload.

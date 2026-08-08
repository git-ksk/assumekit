import { AwsClient } from "aws4fetch";
import {
  assertNonNegativeFiniteNumber,
  assertNonNegativeInteger,
  assertPositiveFiniteNumber,
} from "./http.js";
import { assumeRoleWithWebIdentity } from "./sts.js";
import type {
  AwsFetch,
  AwsTemporaryCredentials,
  CreateAwsFetchOptions,
  WorkloadIdentityProvider,
} from "./types.js";

export { gcpMetadataIdentity } from "./providers/gcp.js";
export type { GcpMetadataIdentityOptions } from "./providers/gcp.js";
export type {
  AwsFetch,
  AwsTemporaryCredentials,
  CreateAwsFetchOptions,
  WorkloadIdentityProvider,
} from "./types.js";

const DEFAULT_REFRESH_BEFORE_MS = 5 * 60 * 1000;

function defaultSessionName(): string {
  return `assumekit-${Date.now()}`;
}

function validateCreateOptions(options: CreateAwsFetchOptions): void {
  if (!options.roleArn) throw new Error("roleArn is required.");
  if (!options.region || !/^[a-z0-9-]+$/.test(options.region)) {
    throw new Error("region must contain only lowercase letters, digits, and hyphens.");
  }
  if (!options.service || !/^[A-Za-z0-9_-]+$/.test(options.service)) {
    throw new Error("service must contain only letters, digits, underscores, and hyphens.");
  }
  if (!options.identity || typeof options.identity.getToken !== "function") {
    throw new Error("identity must provide getToken().");
  }

  const refreshBeforeMs = options.refreshBeforeMs ?? DEFAULT_REFRESH_BEFORE_MS;
  if (!Number.isFinite(refreshBeforeMs) || refreshBeforeMs < 0) {
    throw new Error("refreshBeforeMs must be a non-negative finite number.");
  }

  if (options.stsTimeoutMs !== undefined) {
    assertPositiveFiniteNumber(options.stsTimeoutMs, "stsTimeoutMs");
  }
  if (options.stsMaxRetries !== undefined) {
    assertNonNegativeInteger(options.stsMaxRetries, "stsMaxRetries");
  }
  if (options.stsRetryBaseMs !== undefined) {
    assertNonNegativeFiniteNumber(options.stsRetryBaseMs, "stsRetryBaseMs");
  }
  if (options.retries !== undefined) {
    assertNonNegativeInteger(options.retries, "retries");
  }
}

export function createAwsFetch(options: CreateAwsFetchOptions): AwsFetch {
  validateCreateOptions(options);

  const refreshBeforeMs = options.refreshBeforeMs ?? DEFAULT_REFRESH_BEFORE_MS;
  let credentials: AwsTemporaryCredentials | undefined;
  let client: AwsClient | undefined;
  let refreshPromise: Promise<AwsTemporaryCredentials> | undefined;

  async function getClient(): Promise<AwsClient> {
    const now = Date.now();
    if (
      credentials &&
      client &&
      credentials.expiration.getTime() - refreshBeforeMs > now
    ) {
      return client;
    }

    if (!refreshPromise) {
      refreshPromise = (async () => {
        const token = await options.identity.getToken();
        return assumeRoleWithWebIdentity({
          roleArn: options.roleArn,
          webIdentityToken: token,
          sessionName: options.sessionName ?? defaultSessionName(),
          durationSeconds: options.durationSeconds,
          region: options.region,
          timeoutMs: options.stsTimeoutMs,
          maxRetries: options.stsMaxRetries,
          retryBaseMs: options.stsRetryBaseMs,
        });
      })();
    }

    try {
      credentials = await refreshPromise;
      client = new AwsClient({
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
        region: options.region,
        service: options.service,
        // Safe default for non-idempotent calls such as MCP POST requests.
        retries: options.retries ?? 0,
      });
      return client;
    } finally {
      refreshPromise = undefined;
    }
  }

  return async (input, init) => {
    const aws = await getClient();
    return aws.fetch(input, init);
  };
}

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

function normalizeAllowedHost(host: string): string {
  if (!host || host.trim() !== host) {
    throw new Error("allowedHosts entries must be non-empty host names without surrounding whitespace.");
  }

  let parsed: URL;
  try {
    parsed = new URL(`https://${host}/`);
  } catch {
    throw new Error(`allowedHosts contains an invalid host: ${host}`);
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      `allowedHosts entries must contain only a host name and optional port: ${host}`,
    );
  }

  return parsed.host.toLowerCase();
}

function validateAllowedHosts(allowedHosts: readonly string[]): Set<string> {
  if (!Array.isArray(allowedHosts) || allowedHosts.length === 0) {
    throw new Error("allowedHosts must contain at least one HTTPS request host.");
  }

  const normalized = new Set<string>();
  for (const host of allowedHosts) {
    if (typeof host !== "string") {
      throw new Error("allowedHosts entries must be strings.");
    }
    normalized.add(normalizeAllowedHost(host));
  }
  return normalized;
}

function validateRequestTarget(
  input: RequestInfo | URL,
  allowedHosts: ReadonlySet<string>,
): void {
  let target: URL;
  try {
    target = input instanceof Request ? new URL(input.url) : new URL(String(input));
  } catch {
    throw new Error("AWS request target must be an absolute HTTPS URL.");
  }

  if (target.protocol !== "https:") {
    throw new Error("AWS request target must use HTTPS.");
  }
  if (target.username || target.password) {
    throw new Error("AWS request target must not include URL credentials.");
  }
  if (!allowedHosts.has(target.host.toLowerCase())) {
    throw new Error(`AWS request host is not allowed: ${target.host}`);
  }
}

function validateCreateOptions(options: CreateAwsFetchOptions): Set<string> {
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

  const allowedHosts = validateAllowedHosts(options.allowedHosts);

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

  return allowedHosts;
}

export function createAwsFetch(options: CreateAwsFetchOptions): AwsFetch {
  const allowedHosts = validateCreateOptions(options);

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
    validateRequestTarget(input, allowedHosts);
    const aws = await getClient();
    // A redirect can leave the validated allowlisted origin. Reject all redirects
    // instead of relying on downstream fetch Authorization-header behavior.
    return aws.fetch(input, { ...init, redirect: "error" });
  };
}

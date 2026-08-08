import {
  assertNonNegativeFiniteNumber,
  assertNonNegativeInteger,
  assertPositiveFiniteNumber,
  fetchWithTimeout,
  isRetryableHttpStatus,
  sleepWithFullJitter,
} from "../http.js";
import type { WorkloadIdentityProvider } from "../types.js";

const METADATA_IDENTITY_BASE =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts";
const SERVICE_ACCOUNT_SEGMENT = /^[A-Za-z0-9._@-]+$/;
const DEFAULT_TIMEOUT_MS = 3_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_MS = 50;

class MetadataHttpError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "MetadataHttpError";
    this.retryable = retryable;
  }
}

export interface GcpMetadataIdentityOptions {
  audience: string;
  serviceAccount?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseMs?: number;
  fetchImpl?: typeof fetch;
}

export function gcpMetadataIdentity(
  options: GcpMetadataIdentityOptions,
): WorkloadIdentityProvider {
  if (!options.audience) {
    throw new Error("GCP workload identity requires a non-empty audience.");
  }

  const serviceAccount = options.serviceAccount ?? "default";
  if (!SERVICE_ACCOUNT_SEGMENT.test(serviceAccount)) {
    throw new Error(
      "GCP serviceAccount contains unsupported characters for the metadata path.",
    );
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryBaseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
  assertPositiveFiniteNumber(timeoutMs, "GCP metadata timeoutMs");
  assertNonNegativeInteger(maxRetries, "GCP metadata maxRetries");
  assertNonNegativeFiniteNumber(retryBaseMs, "GCP metadata retryBaseMs");

  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    name: "gcp-metadata",
    async getToken(): Promise<string> {
      const url = new URL(`${METADATA_IDENTITY_BASE}/${serviceAccount}/identity`);
      url.searchParams.set("audience", options.audience);
      // Standard format omits unnecessary project/instance details.
      url.searchParams.set("format", "standard");

      let lastError: unknown;

      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        let response: Response;
        try {
          response = await fetchWithTimeout(
            fetchImpl,
            url,
            {
              method: "GET",
              headers: { "Metadata-Flavor": "Google" },
            },
            timeoutMs,
            "GCP metadata identity request",
          );
        } catch (error) {
          lastError = error;
          if (attempt >= maxRetries) throw error;
          await sleepWithFullJitter(attempt, retryBaseMs);
          continue;
        }

        if (!response.ok) {
          const retryable = isRetryableHttpStatus(response.status);
          const error = new MetadataHttpError(
            `Failed to obtain GCP identity token: ${response.status} ${response.statusText}`,
            retryable,
          );
          if (attempt < maxRetries && retryable) {
            lastError = error;
            await sleepWithFullJitter(attempt, retryBaseMs);
            continue;
          }
          throw error;
        }

        const token = (await response.text()).trim();
        if (!token) {
          throw new Error("GCP metadata server returned an empty identity token.");
        }

        return token;
      }

      throw lastError instanceof Error
        ? lastError
        : new Error("Failed to obtain GCP identity token.");
    },
  };
}

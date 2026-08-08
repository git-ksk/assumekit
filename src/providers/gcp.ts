import type { WorkloadIdentityProvider } from "../types.js";

const DEFAULT_METADATA_BASE =
  "http://metadata.google.internal/computeMetadata/v1";
const SERVICE_ACCOUNT_SEGMENT = /^[A-Za-z0-9._@-]+$/;

export interface GcpMetadataIdentityOptions {
  audience: string;
  serviceAccount?: string;
  metadataBaseUrl?: string;
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

  const metadataBaseUrl = (options.metadataBaseUrl ?? DEFAULT_METADATA_BASE).replace(
    /\/+$/,
    "",
  );
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    name: "gcp-metadata",
    async getToken(): Promise<string> {
      const url = new URL(
        `${metadataBaseUrl}/instance/service-accounts/${serviceAccount}/identity`,
      );
      url.searchParams.set("audience", options.audience);
      // Keep the token minimal: project/instance details are unnecessary for AWS STS.
      url.searchParams.set("format", "standard");

      const response = await fetchImpl(url, {
        method: "GET",
        headers: { "Metadata-Flavor": "Google" },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to obtain GCP identity token: ${response.status} ${response.statusText}`,
        );
      }

      const token = (await response.text()).trim();
      if (!token) {
        throw new Error("GCP metadata server returned an empty identity token.");
      }

      return token;
    },
  };
}

import { AwsClient } from "aws4fetch";
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
  return `aws-assumekit-${Date.now()}`;
}

export function createAwsFetch(options: CreateAwsFetchOptions): AwsFetch {
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
          endpoint: options.stsEndpoint,
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

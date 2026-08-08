import { AwsClient } from "aws4fetch";
import { assumeRoleWithWebIdentity } from "./sts.js";
import type {
  AwsFetch,
  AwsTemporaryCredentials,
  CreateAwsFetchOptions,
  WorkloadIdentityProvider,
} from "./types.js";

export { gcpMetadataIdentity } from "./providers/gcp.js";
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
  let refreshPromise: Promise<AwsTemporaryCredentials> | undefined;

  async function getCredentials(): Promise<AwsTemporaryCredentials> {
    const now = Date.now();
    if (
      credentials &&
      credentials.expiration.getTime() - refreshBeforeMs > now
    ) {
      return credentials;
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
      return credentials;
    } finally {
      refreshPromise = undefined;
    }
  }

  return async (input, init) => {
    const creds = await getCredentials();
    const client = new AwsClient({
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
      region: options.region,
      service: options.service,
    });

    return client.fetch(input, init);
  };
}

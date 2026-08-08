export interface AwsTemporaryCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
}

export interface WorkloadIdentityProvider {
  readonly name: string;
  getToken(): Promise<string>;
}

export interface CreateAwsFetchOptions {
  roleArn: string;
  region: string;
  service: string;
  identity: WorkloadIdentityProvider;
  sessionName?: string;
  durationSeconds?: number;
  refreshBeforeMs?: number;
  /** AWS STS request timeout per attempt. Defaults to 10000ms. */
  stsTimeoutMs?: number;
  /** AWS STS retries for transient credential-exchange failures. Defaults to 2. */
  stsMaxRetries?: number;
  /** Base delay for full-jitter AWS STS retry backoff. Defaults to 100ms. */
  stsRetryBaseMs?: number;
  /** Number of retries performed for signed AWS service requests. Defaults to 0. */
  retries?: number;
}

export type AwsFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

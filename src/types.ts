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
  stsEndpoint?: string;
  /** Number of HTTP retries performed by the SigV4 client. Defaults to 0. */
  retries?: number;
}

export type AwsFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

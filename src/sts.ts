import {
  assertNonNegativeFiniteNumber,
  assertNonNegativeInteger,
  assertPositiveFiniteNumber,
  fetchWithTimeout,
  isRetryableHttpStatus,
  sleepWithFullJitter,
} from "./http.js";
import type { AwsTemporaryCredentials } from "./types.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_MS = 100;
const SESSION_NAME_PATTERN = /^[A-Za-z0-9_+=,.@-]{2,64}$/;

export interface AssumeRoleWithWebIdentityOptions {
  roleArn: string;
  webIdentityToken: string;
  sessionName: string;
  region: string;
  durationSeconds?: number;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseMs?: number;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

export class StsError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(`AWS STS ${code}: ${message}`);
    this.name = "StsError";
    this.code = code;
    this.status = status;
  }
}

function extractXmlTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match?.[1]
    ?.replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function validateRegion(region: string): void {
  if (!region || !/^[a-z0-9-]+$/.test(region)) {
    throw new Error("AWS region must contain only lowercase letters, digits, and hyphens.");
  }
}

function validateEndpoint(endpoint: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error("AWS STS endpoint must be a valid HTTPS URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("AWS STS endpoint must use HTTPS.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("AWS STS endpoint must not include URL credentials.");
  }
  return parsed;
}

export function regionalStsEndpoint(region: string): string {
  validateRegion(region);
  const suffix = region.startsWith("cn-") ? "amazonaws.com.cn" : "amazonaws.com";
  return `https://sts.${region}.${suffix}/`;
}

function validateOptions(options: AssumeRoleWithWebIdentityOptions): void {
  if (!options.roleArn || options.roleArn.length < 20 || options.roleArn.length > 2048) {
    throw new Error("AWS roleArn must be between 20 and 2048 characters.");
  }
  if (!SESSION_NAME_PATTERN.test(options.sessionName)) {
    throw new Error(
      "AWS role session name must be 2-64 characters using letters, digits, _+=,.@- only.",
    );
  }
  if (
    options.webIdentityToken.length < 4 ||
    options.webIdentityToken.length > 20_000
  ) {
    throw new Error("Web identity token length must be between 4 and 20000 characters.");
  }
  validateRegion(options.region);

  if (options.durationSeconds !== undefined) {
    if (
      !Number.isInteger(options.durationSeconds) ||
      options.durationSeconds < 900 ||
      options.durationSeconds > 43_200
    ) {
      throw new Error("durationSeconds must be an integer between 900 and 43200.");
    }
  }

  assertPositiveFiniteNumber(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, "STS timeoutMs");
  assertNonNegativeInteger(options.maxRetries ?? DEFAULT_MAX_RETRIES, "STS maxRetries");
  assertNonNegativeFiniteNumber(
    options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS,
    "STS retryBaseMs",
  );

  validateEndpoint(options.endpoint ?? regionalStsEndpoint(options.region));
}

function isRetryableStsError(code: string, status: number): boolean {
  return code === "IDPCommunicationError" || isRetryableHttpStatus(status);
}

export async function assumeRoleWithWebIdentity(
  options: AssumeRoleWithWebIdentityOptions,
): Promise<AwsTemporaryCredentials> {
  validateOptions(options);

  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = validateEndpoint(
    options.endpoint ?? regionalStsEndpoint(options.region),
  ).toString();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryBaseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;

  const body = new URLSearchParams({
    Action: "AssumeRoleWithWebIdentity",
    Version: "2011-06-15",
    RoleArn: options.roleArn,
    RoleSessionName: options.sessionName,
    WebIdentityToken: options.webIdentityToken,
  });

  if (options.durationSeconds !== undefined) {
    body.set("DurationSeconds", String(options.durationSeconds));
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        fetchImpl,
        endpoint,
        {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
        },
        timeoutMs,
        "AWS STS",
      );
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) throw error;
      await sleepWithFullJitter(attempt, retryBaseMs);
      continue;
    }

    const xml = await response.text();
    if (!response.ok) {
      const code = extractXmlTag(xml, "Code") ?? "UnknownError";
      const message = extractXmlTag(xml, "Message") ?? response.statusText;
      const error = new StsError(code, message, response.status);
      if (attempt < maxRetries && isRetryableStsError(code, response.status)) {
        lastError = error;
        await sleepWithFullJitter(attempt, retryBaseMs);
        continue;
      }
      throw error;
    }

    const accessKeyId = extractXmlTag(xml, "AccessKeyId");
    const secretAccessKey = extractXmlTag(xml, "SecretAccessKey");
    const sessionToken = extractXmlTag(xml, "SessionToken");
    const expiration = extractXmlTag(xml, "Expiration");

    if (!accessKeyId || !secretAccessKey || !sessionToken || !expiration) {
      throw new Error(
        "AWS STS response did not contain complete temporary credentials.",
      );
    }

    const expirationDate = new Date(expiration);
    if (Number.isNaN(expirationDate.getTime())) {
      throw new Error("AWS STS returned an invalid credential expiration timestamp.");
    }

    return {
      accessKeyId,
      secretAccessKey,
      sessionToken,
      expiration: expirationDate,
    };
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("AWS STS credential exchange failed.");
}

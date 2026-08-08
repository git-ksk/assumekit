import type { AwsTemporaryCredentials } from "./types.js";

export interface AssumeRoleWithWebIdentityOptions {
  roleArn: string;
  webIdentityToken: string;
  sessionName: string;
  durationSeconds?: number;
  endpoint?: string;
  fetchImpl?: typeof fetch;
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

export async function assumeRoleWithWebIdentity(
  options: AssumeRoleWithWebIdentityOptions,
): Promise<AwsTemporaryCredentials> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? "https://sts.amazonaws.com/";

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

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const xml = await response.text();
  if (!response.ok) {
    const code = extractXmlTag(xml, "Code") ?? "UnknownError";
    const message = extractXmlTag(xml, "Message") ?? response.statusText;
    throw new Error(`AWS STS ${code}: ${message}`);
  }

  const accessKeyId = extractXmlTag(xml, "AccessKeyId");
  const secretAccessKey = extractXmlTag(xml, "SecretAccessKey");
  const sessionToken = extractXmlTag(xml, "SessionToken");
  const expiration = extractXmlTag(xml, "Expiration");

  if (!accessKeyId || !secretAccessKey || !sessionToken || !expiration) {
    throw new Error("AWS STS response did not contain complete temporary credentials.");
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

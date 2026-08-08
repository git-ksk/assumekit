import { describe, expect, it, vi } from "vitest";
import { assumeRoleWithWebIdentity } from "./sts.js";

describe("assumeRoleWithWebIdentity", () => {
  it("parses temporary credentials from STS", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        `<AssumeRoleWithWebIdentityResponse><AssumeRoleWithWebIdentityResult><Credentials><AccessKeyId>AKIAEXAMPLE</AccessKeyId><SecretAccessKey>secret</SecretAccessKey><SessionToken>token</SessionToken><Expiration>2030-01-01T00:00:00Z</Expiration></Credentials></AssumeRoleWithWebIdentityResult></AssumeRoleWithWebIdentityResponse>`,
        { status: 200 },
      ),
    );

    const creds = await assumeRoleWithWebIdentity({
      roleArn: "arn:aws:iam::<AWS_ACCOUNT_ID>:role/example",
      webIdentityToken: "jwt",
      sessionName: "test",
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(creds.accessKeyId).toBe("AKIAEXAMPLE");
    expect(creds.expiration.toISOString()).toBe("2030-01-01T00:00:00.000Z");
  });
});

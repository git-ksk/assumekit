import { describe, expect, it } from "vitest";
import {
  assumeRoleWithWebIdentity,
  regionalStsEndpoint,
} from "./sts.js";

const ROLE_ARN = "arn:aws:iam::123456789012:role/example-role";

function successXml(expiration = "2030-01-01T00:00:00Z"): string {
  return `<AssumeRoleWithWebIdentityResponse><AssumeRoleWithWebIdentityResult><Credentials><AccessKeyId>ASIAEXAMPLE</AccessKeyId><SecretAccessKey>secret</SecretAccessKey><SessionToken>token</SessionToken><Expiration>${expiration}</Expiration></Credentials></AssumeRoleWithWebIdentityResult></AssumeRoleWithWebIdentityResponse>`;
}

function errorXml(code: string, message: string): string {
  return `<ErrorResponse><Error><Code>${code}</Code><Message>${message}</Message></Error></ErrorResponse>`;
}

describe("regionalStsEndpoint", () => {
  it("uses the AWS regional endpoint", () => {
    expect(regionalStsEndpoint("ap-northeast-1")).toBe(
      "https://sts.ap-northeast-1.amazonaws.com/",
    );
  });

  it("uses the China partition suffix", () => {
    expect(regionalStsEndpoint("cn-north-1")).toBe(
      "https://sts.cn-north-1.amazonaws.com.cn/",
    );
  });
});

describe("assumeRoleWithWebIdentity", () => {
  it("uses regional STS and parses temporary credentials", async () => {
    const requests: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      requests.push(String(input));
      return new Response(successXml(), { status: 200 });
    };

    const creds = await assumeRoleWithWebIdentity({
      roleArn: ROLE_ARN,
      webIdentityToken: "jwt-token",
      sessionName: "assumekit-test",
      region: "ap-northeast-1",
      fetchImpl,
    });

    expect(requests).toEqual(["https://sts.ap-northeast-1.amazonaws.com/"]);
    expect(creds.accessKeyId).toBe("ASIAEXAMPLE");
    expect(creds.expiration.toISOString()).toBe("2030-01-01T00:00:00.000Z");
  });

  it("retries transient IDP communication errors only a limited number of times", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      if (calls < 3) {
        return new Response(errorXml("IDPCommunicationError", "temporary"), {
          status: 400,
        });
      }
      return new Response(successXml(), { status: 200 });
    };

    await expect(
      assumeRoleWithWebIdentity({
        roleArn: ROLE_ARN,
        webIdentityToken: "jwt-token",
        sessionName: "assumekit-test",
        region: "us-east-1",
        maxRetries: 2,
        retryBaseMs: 0,
        fetchImpl,
      }),
    ).resolves.toMatchObject({ accessKeyId: "ASIAEXAMPLE" });

    expect(calls).toBe(3);
  });

  it("does not retry rejected claims", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return new Response(errorXml("IDPRejectedClaim", "rejected"), {
        status: 403,
      });
    };

    await expect(
      assumeRoleWithWebIdentity({
        roleArn: ROLE_ARN,
        webIdentityToken: "jwt-token",
        sessionName: "assumekit-test",
        region: "us-east-1",
        maxRetries: 2,
        retryBaseMs: 0,
        fetchImpl,
      }),
    ).rejects.toThrow(/IDPRejectedClaim/);

    expect(calls).toBe(1);
  });

  it("rejects insecure custom STS endpoints", async () => {
    await expect(
      assumeRoleWithWebIdentity({
        roleArn: ROLE_ARN,
        webIdentityToken: "jwt-token",
        sessionName: "assumekit-test",
        region: "us-east-1",
        endpoint: "http://sts.example.test/",
        fetchImpl: async () => new Response(successXml()),
      }),
    ).rejects.toThrow(/must use HTTPS/);
  });

  it("validates the AWS session duration and session name before network calls", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("should not be called");
    };

    await expect(
      assumeRoleWithWebIdentity({
        roleArn: ROLE_ARN,
        webIdentityToken: "jwt-token",
        sessionName: "has spaces",
        region: "us-east-1",
        fetchImpl,
      }),
    ).rejects.toThrow(/session name/);

    await expect(
      assumeRoleWithWebIdentity({
        roleArn: ROLE_ARN,
        webIdentityToken: "jwt-token",
        sessionName: "valid-name",
        region: "us-east-1",
        durationSeconds: 899,
        fetchImpl,
      }),
    ).rejects.toThrow(/900 and 43200/);
  });

  it("times out stalled STS requests", async () => {
    const fetchImpl: typeof fetch = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });

    await expect(
      assumeRoleWithWebIdentity({
        roleArn: ROLE_ARN,
        webIdentityToken: "jwt-token",
        sessionName: "assumekit-test",
        region: "us-east-1",
        timeoutMs: 10,
        maxRetries: 0,
        fetchImpl,
      }),
    ).rejects.toThrow(/timed out/);
  });
});

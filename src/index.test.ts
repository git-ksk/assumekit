import { afterEach, describe, expect, it, vi } from "vitest";
import { createAwsFetch } from "./index.js";
import type { WorkloadIdentityProvider } from "./types.js";

const ROLE_ARN = "arn:aws:iam::123456789012:role/example-role";

function successXml(): string {
  return `<AssumeRoleWithWebIdentityResponse><AssumeRoleWithWebIdentityResult><Credentials><AccessKeyId>ASIAEXAMPLE</AccessKeyId><SecretAccessKey>secret</SecretAccessKey><SessionToken>token</SessionToken><Expiration>2030-01-01T00:00:00Z</Expiration></Credentials></AssumeRoleWithWebIdentityResult></AssumeRoleWithWebIdentityResponse>`;
}

function requestUrl(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : String(input);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createAwsFetch", () => {
  it("deduplicates concurrent credential refreshes and reuses cached credentials", async () => {
    let identityCalls = 0;
    let stsCalls = 0;
    let targetCalls = 0;

    const identity: WorkloadIdentityProvider = {
      name: "test",
      async getToken() {
        identityCalls += 1;
        return "jwt-token";
      },
    };

    const fetchImpl: typeof fetch = async (input) => {
      const url = requestUrl(input);
      if (url.startsWith("https://sts.")) {
        stsCalls += 1;
        await new Promise<void>((resolve) => setTimeout(resolve, 5));
        return new Response(successXml(), { status: 200 });
      }
      targetCalls += 1;
      return new Response("ok", { status: 200 });
    };
    vi.stubGlobal("fetch", fetchImpl);

    const awsFetch = createAwsFetch({
      roleArn: ROLE_ARN,
      region: "us-east-1",
      service: "execute-api",
      identity,
    });

    await Promise.all(
      Array.from({ length: 10 }, () =>
        awsFetch("https://example.execute-api.us-east-1.amazonaws.com/health"),
      ),
    );
    await awsFetch("https://example.execute-api.us-east-1.amazonaws.com/health");

    expect(identityCalls).toBe(1);
    expect(stsCalls).toBe(1);
    expect(targetCalls).toBe(11);
  });

  it("does not implicitly retry signed service requests", async () => {
    let targetCalls = 0;
    const identity: WorkloadIdentityProvider = {
      name: "test",
      async getToken() {
        return "jwt-token";
      },
    };

    const fetchImpl: typeof fetch = async (input) => {
      const url = requestUrl(input);
      if (url.startsWith("https://sts.")) {
        return new Response(successXml(), { status: 200 });
      }
      targetCalls += 1;
      return new Response("failure", { status: 500 });
    };
    vi.stubGlobal("fetch", fetchImpl);

    const awsFetch = createAwsFetch({
      roleArn: ROLE_ARN,
      region: "us-east-1",
      service: "execute-api",
      identity,
    });

    const response = await awsFetch(
      "https://example.execute-api.us-east-1.amazonaws.com/action",
      { method: "POST", body: "{}" },
    );

    expect(response.status).toBe(500);
    expect(targetCalls).toBe(1);
  });

  it("rejects invalid retry configuration before obtaining identity tokens", () => {
    const identity: WorkloadIdentityProvider = {
      name: "test",
      async getToken() {
        return "jwt-token";
      },
    };

    expect(() =>
      createAwsFetch({
        roleArn: ROLE_ARN,
        region: "us-east-1",
        service: "execute-api",
        identity,
        retries: -1,
      }),
    ).toThrow(/retries/);
  });
});

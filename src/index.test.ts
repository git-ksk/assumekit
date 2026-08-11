import { afterEach, describe, expect, it, vi } from "vitest";
import { createAwsFetch } from "./index.js";
import type { WorkloadIdentityProvider } from "./types.js";

const ROLE_ARN = "arn:aws:iam::123456789012:role/example-role";
const TARGET_HOST = "example.execute-api.us-east-1.amazonaws.com";

function successXml(expiration = "2030-01-01T00:00:00Z"): string {
  return `<AssumeRoleWithWebIdentityResponse><AssumeRoleWithWebIdentityResult><Credentials><AccessKeyId>ASIAEXAMPLE</AccessKeyId><SecretAccessKey>secret</SecretAccessKey><SessionToken>token</SessionToken><Expiration>${expiration}</Expiration></Credentials></AssumeRoleWithWebIdentityResult></AssumeRoleWithWebIdentityResponse>`;
}

function errorXml(code: string, message: string): string {
  return `<ErrorResponse><Error><Code>${code}</Code><Message>${message}</Message></Error></ErrorResponse>`;
}

function requestUrl(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : String(input);
}

afterEach(() => {
  vi.restoreAllMocks();
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
      allowedHosts: [TARGET_HOST],
    });

    await Promise.all(
      Array.from({ length: 10 }, () =>
        awsFetch(`https://${TARGET_HOST}/health`),
      ),
    );
    await awsFetch(`https://${TARGET_HOST}/health`);

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
      allowedHosts: [TARGET_HOST],
    });

    const response = await awsFetch(`https://${TARGET_HOST}/action`, {
      method: "POST",
      body: "{}",
    });

    expect(response.status).toBe(500);
    expect(targetCalls).toBe(1);
  });

  it("rejects unapproved or insecure request targets before obtaining credentials", async () => {
    let identityCalls = 0;
    const identity: WorkloadIdentityProvider = {
      name: "test",
      async getToken() {
        identityCalls += 1;
        return "jwt-token";
      },
    };

    const awsFetch = createAwsFetch({
      roleArn: ROLE_ARN,
      region: "us-east-1",
      service: "execute-api",
      identity,
      allowedHosts: [TARGET_HOST],
    });

    await expect(awsFetch("https://attacker.example/action")).rejects.toThrow(
      /not allowed/,
    );
    await expect(awsFetch(`http://${TARGET_HOST}/action`)).rejects.toThrow(
      /must use HTTPS/,
    );
    expect(identityCalls).toBe(0);
  });

  it("forces signed service requests to reject redirects", async () => {
    let targetRedirect: RequestRedirect | undefined;
    const identity: WorkloadIdentityProvider = {
      name: "test",
      async getToken() {
        return "jwt-token";
      },
    };

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = requestUrl(input);
      if (url.startsWith("https://sts.")) {
        return new Response(successXml(), { status: 200 });
      }
      targetRedirect = input instanceof Request ? input.redirect : init?.redirect;
      return new Response("redirect", {
        status: 302,
        headers: { location: "https://attacker.example/" },
      });
    };
    vi.stubGlobal("fetch", fetchImpl);

    const awsFetch = createAwsFetch({
      roleArn: ROLE_ARN,
      region: "us-east-1",
      service: "execute-api",
      identity,
      allowedHosts: [TARGET_HOST],
    });

    await awsFetch(`https://${TARGET_HOST}/redirect`, { redirect: "follow" });
    expect(targetRedirect).toBe("error");
  });

  it("requires explicit, host-only allowedHosts configuration", () => {
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
        allowedHosts: [],
      }),
    ).toThrow(/allowedHosts/);

    expect(() =>
      createAwsFetch({
        roleArn: ROLE_ARN,
        region: "us-east-1",
        service: "execute-api",
        identity,
        allowedHosts: [`https://${TARGET_HOST}/path`],
      }),
    ).toThrow(/host name and optional port/);
  });

  it("recovers after a failed credential refresh instead of retaining the rejected refresh", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(
      Date.parse("2029-12-31T23:00:00Z"),
    );
    let identityCalls = 0;
    let stsCalls = 0;

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
        if (stsCalls === 1) {
          return new Response(successXml("2030-01-01T00:00:00Z"), { status: 200 });
        }
        if (stsCalls === 2) {
          return new Response(errorXml("ServiceUnavailable", "temporary"), {
            status: 503,
          });
        }
        return new Response(successXml("2030-01-01T01:00:00Z"), { status: 200 });
      }
      return new Response("ok", { status: 200 });
    };
    vi.stubGlobal("fetch", fetchImpl);

    const awsFetch = createAwsFetch({
      roleArn: ROLE_ARN,
      region: "us-east-1",
      service: "execute-api",
      identity,
      allowedHosts: [TARGET_HOST],
      refreshBeforeMs: 5 * 60 * 1000,
      stsMaxRetries: 0,
    });

    await expect(awsFetch(`https://${TARGET_HOST}/health`)).resolves.toMatchObject({
      status: 200,
    });

    now.mockReturnValue(Date.parse("2029-12-31T23:56:00Z"));
    await expect(awsFetch(`https://${TARGET_HOST}/health`)).rejects.toThrow(
      /ServiceUnavailable/,
    );
    await expect(awsFetch(`https://${TARGET_HOST}/health`)).resolves.toMatchObject({
      status: 200,
    });

    expect(identityCalls).toBe(3);
    expect(stsCalls).toBe(3);
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
        allowedHosts: [TARGET_HOST],
        retries: -1,
      }),
    ).toThrow(/retries/);
  });
});

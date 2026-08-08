import { describe, expect, it } from "vitest";
import { gcpMetadataIdentity } from "./gcp.js";

describe("gcpMetadataIdentity", () => {
  it("requests a minimal ID token from the Google metadata server", async () => {
    const requests: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      requests.push([input, init]);
      return new Response("header.payload.signature", { status: 200 });
    };
    const provider = gcpMetadataIdentity({
      audience: "assumekit",
      fetchImpl,
    });

    const token = await provider.getToken();
    expect(token).toBe("header.payload.signature");

    const [url, init] = requests[0]!;
    expect(String(url)).toContain("metadata.google.internal");
    expect(String(url)).toContain("audience=assumekit");
    expect(String(url)).toContain("format=standard");
    expect(init?.headers).toEqual({ "Metadata-Flavor": "Google" });
    expect(init?.redirect).toBe("error");
  });

  it("keeps @ unescaped in a service-account metadata path", async () => {
    const requests: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      requests.push([input, init]);
      return new Response("jwt", { status: 200 });
    };
    const provider = gcpMetadataIdentity({
      audience: "example-audience",
      serviceAccount: "runtime@example-project.iam.gserviceaccount.com",
      fetchImpl,
    });

    await provider.getToken();
    const [url] = requests[0]!;
    expect(String(url)).toContain(
      "/service-accounts/runtime@example-project.iam.gserviceaccount.com/identity",
    );
    expect(String(url)).not.toContain("%40");
  });

  it("rejects service-account path traversal and dot segments", () => {
    for (const serviceAccount of ["../default", ".", ".."]) {
      expect(() =>
        gcpMetadataIdentity({
          audience: "example-audience",
          serviceAccount,
        }),
      ).toThrow(/unsupported metadata path segment/);
    }
  });

  it("retries transient metadata failures", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      if (calls < 3) return new Response("busy", { status: 503 });
      return new Response("jwt", { status: 200 });
    };
    const provider = gcpMetadataIdentity({
      audience: "example-audience",
      maxRetries: 2,
      retryBaseMs: 0,
      fetchImpl,
    });

    await expect(provider.getToken()).resolves.toBe("jwt");
    expect(calls).toBe(3);
  });

  it("does not retry authorization/configuration failures", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return new Response("forbidden", { status: 403, statusText: "Forbidden" });
    };
    const provider = gcpMetadataIdentity({
      audience: "example-audience",
      maxRetries: 2,
      retryBaseMs: 0,
      fetchImpl,
    });

    await expect(provider.getToken()).rejects.toThrow(/403 Forbidden/);
    expect(calls).toBe(1);
  });

  it("times out stalled metadata requests", async () => {
    const fetchImpl: typeof fetch = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    const provider = gcpMetadataIdentity({
      audience: "example-audience",
      timeoutMs: 10,
      maxRetries: 0,
      fetchImpl,
    });

    await expect(provider.getToken()).rejects.toThrow(/timed out/);
  });
});

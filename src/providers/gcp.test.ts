import { describe, expect, it, vi } from "vitest";
import { gcpMetadataIdentity } from "./gcp.js";

describe("gcpMetadataIdentity", () => {
  it("requests a minimal ID token from the metadata server", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("header.payload.signature", { status: 200 }),
    );
    const provider = gcpMetadataIdentity({
      audience: "aws-assumekit",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const token = await provider.getToken();
    expect(token).toBe("header.payload.signature");

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain("audience=aws-assumekit");
    expect(String(url)).toContain("format=standard");
    expect((init as RequestInit).headers).toEqual({ "Metadata-Flavor": "Google" });
  });

  it("keeps @ unescaped in a service-account metadata path", async () => {
    const fetchImpl = vi.fn(async () => new Response("jwt", { status: 200 }));
    const provider = gcpMetadataIdentity({
      audience: "example-audience",
      serviceAccount: "runtime@example-project.iam.gserviceaccount.com",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await provider.getToken();
    const [url] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain(
      "/service-accounts/runtime@example-project.iam.gserviceaccount.com/identity",
    );
    expect(String(url)).not.toContain("%40");
  });

  it("rejects service-account path traversal", () => {
    expect(() =>
      gcpMetadataIdentity({
        audience: "example-audience",
        serviceAccount: "../default",
      }),
    ).toThrow(/unsupported characters/);
  });
});

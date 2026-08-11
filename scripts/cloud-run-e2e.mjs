import { createServer } from "node:http";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

if (!process.env.K_SERVICE) {
  throw new Error(
    "e2e:cloud-run must run inside a Cloud Run service revision so the metadata identity path is real.",
  );
}

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}

const endpoint = new URL(required("AWS_ENDPOINT"));
if (endpoint.protocol !== "https:") {
  throw new Error("AWS_ENDPOINT must use HTTPS.");
}

const { createAwsFetch, gcpMetadataIdentity } = await import("../dist/index.js");

const awsFetch = createAwsFetch({
  roleArn: required("AWS_ROLE_ARN"),
  region: required("AWS_REGION"),
  service: required("AWS_SERVICE"),
  identity: gcpMetadataIdentity({
    audience: required("AWS_OIDC_AUDIENCE"),
  }),
  allowedHosts: [endpoint.host],
  retries: 0,
});

const response = await awsFetch(endpoint, { redirect: "error" });
if (!response.ok) {
  throw new Error(`Cloud Run → AWS E2E failed with HTTP ${response.status}.`);
}

console.log(`Cloud Run → AWS E2E passed with HTTP ${response.status}.`);

createServer((_request, serverResponse) => {
  serverResponse.statusCode = 200;
  serverResponse.setHeader("content-type", "text/plain; charset=utf-8");
  serverResponse.end("AssumeKit Cloud Run → AWS E2E passed.\n");
}).listen(port, "0.0.0.0", () => {
  console.log(`E2E health server listening on port ${port}.`);
});

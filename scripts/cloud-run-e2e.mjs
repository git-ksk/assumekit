import { createAwsFetch, gcpMetadataIdentity } from "../dist/index.js";

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

const endpoint = new URL(required("AWS_ENDPOINT"));
if (endpoint.protocol !== "https:") {
  throw new Error("AWS_ENDPOINT must use HTTPS.");
}

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

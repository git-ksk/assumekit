import { createAwsFetch, gcpMetadataIdentity } from "assumekit";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const endpoint = new URL(required("AWS_ENDPOINT"));
const awsFetch = createAwsFetch({
  roleArn: required("AWS_ROLE_ARN"),
  region: required("AWS_REGION"),
  service: required("AWS_SERVICE"),
  identity: gcpMetadataIdentity({
    audience: required("AWS_OIDC_AUDIENCE"),
  }),
  allowedHosts: [endpoint.host],
});

const response = await awsFetch(endpoint);

if (!response.ok) {
  throw new Error(`AWS request failed: ${response.status}`);
}

console.log(`AWS request succeeded: ${response.status}`);

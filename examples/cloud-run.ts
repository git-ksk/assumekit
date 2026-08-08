import { createAwsFetch, gcpMetadataIdentity } from "assumekit";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const awsFetch = createAwsFetch({
  roleArn: required("AWS_ROLE_ARN"),
  region: required("AWS_REGION"),
  service: required("AWS_SERVICE"),
  identity: gcpMetadataIdentity({
    audience: required("AWS_OIDC_AUDIENCE"),
  }),
});

const response = await awsFetch(required("AWS_ENDPOINT"));

if (!response.ok) {
  throw new Error(`AWS request failed: ${response.status}`);
}

console.log(`AWS request succeeded: ${response.status}`);

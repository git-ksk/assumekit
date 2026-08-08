import { createAwsFetch, gcpMetadataIdentity } from "aws-assumekit";

const roleArn = process.env.AWS_ROLE_ARN;
if (!roleArn) throw new Error("AWS_ROLE_ARN is required");

const awsFetch = createAwsFetch({
  roleArn,
  region: process.env.AWS_REGION ?? "us-east-1",
  service: process.env.AWS_SERVICE ?? "execute-api",
  identity: gcpMetadataIdentity({
    audience: process.env.AWS_OIDC_AUDIENCE ?? "aws-assumekit",
  }),
});

const response = await awsFetch("https://example.execute-api.us-east-1.amazonaws.com/health");
console.log(response.status, await response.text());

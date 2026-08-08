# Contributing

[日本語](CONTRIBUTING.ja.md)

Thanks for helping improve AssumeKit.

## Before opening a pull request

- Keep changes focused and small where practical.
- Add or update tests for behavior changes.
- Do not include real credentials, tokens, account IDs, role ARNs, service-account emails, local machine paths, or customer data.
- Run `npm run typecheck`, `npm test`, and `npm run build`.
- Treat changes to trust-policy examples, token handling, retries, endpoint selection, and credential caching as security-sensitive.

## Scope

The initial scope is lightweight external workload identity → AWS STS → SigV4 HTTP access, with GCP metadata identity as the first provider.

Please open an issue before large architectural changes such as daemon/proxy mode, persistent credential storage, or broad SDK abstractions.

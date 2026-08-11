# Contributing

[日本語](CONTRIBUTING.ja.md)

Thanks for helping improve AssumeKit.

## Before opening an issue

- Check existing issues, the README, docs, and troubleshooting guide first.
- Do not include credentials, tokens, production account IDs, private role ARNs, service-account emails, local machine paths, customer data, or PII.
- If the report might describe a security vulnerability, do not post exploit details publicly; follow the [Security Policy](SECURITY.md).

## Before opening a pull request

Keep changes focused and small where practical. Add or update tests for behavior changes.

At minimum, run:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

CI validates supported Node.js versions and performs dependency auditing in addition to the commands above.

## Do not commit public-repository secrets or private identifiers

Do not commit:

- AWS access keys or secret access keys;
- Google ID tokens;
- AWS temporary credentials or session tokens;
- Google service-account private keys;
- production account IDs or private role ARNs;
- private service-account email addresses;
- customer data or PII;
- personal local paths such as `/Users/...`; or
- private endpoints or internal host names.

Use obvious placeholders such as `<AWS_ACCOUNT_ID>`, `example-project`, and `example-*` in examples.

## Security-sensitive changes

Treat changes in these areas as security-sensitive:

- IAM trust-policy examples;
- OIDC claim and audience handling;
- Google metadata requests;
- STS endpoint selection;
- signed-request host allowlisting and redirect policy;
- timeout and retry behavior;
- credential cache and refresh behavior;
- SigV4 signing;
- request replay behavior;
- logging and error messages; and
- dependency, GitHub Actions, and release configuration.

For changes in these areas, review failure modes and information-disclosure risk in addition to the normal success path.

## Project scope

The initial scope is:

```text
external workload identity
        ↓
AWS STS AssumeRoleWithWebIdentity
        ↓
temporary AWS credentials
        ↓
SigV4 HTTP access
```

The first provider is GCP metadata service identity.

Please open an issue before large architectural changes such as:

- daemon or proxy mode;
- persistent credential storage;
- static access-key support;
- broad AWS SDK abstractions;
- automatic IAM provisioning;
- browser support; or
- large breaking changes to the provider interface.

## Documentation

When changing the public API, configuration, release process, or security behavior, update the corresponding English **and** Japanese documentation in the same change.

The documentation index is [docs/README.md](docs/README.md).

## License

Contributions are accepted under the repository's MIT License. See [LICENSE](LICENSE) for the authoritative text.

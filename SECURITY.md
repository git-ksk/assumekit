# Security Policy

## Reporting a vulnerability

Please do not open a public issue containing credentials, tokens, account IDs, private role ARNs, customer information, or exploit details that would put users at immediate risk.

For now, open a minimal public issue stating that you have a security report and omit sensitive details. A private reporting channel will be added before the first stable release.

## Security model

AWS AssumeKit is designed around short-lived credentials obtained through workload identity federation. It does not require persistent AWS access keys.

Security still depends on:

- a narrowly scoped AWS role;
- a restrictive IAM trust policy;
- validating the expected OIDC audience and workload identity;
- least-privilege permissions on the assumed role;
- avoiding token or credential logging.

Temporary credentials are cached only in process memory by the library.

# Contributing

Thanks for considering a contribution.

## Development principles

- keep the runtime dependency surface small;
- do not introduce long-lived credential storage;
- preserve a fetch-first API;
- keep identity providers modular;
- add tests for credential refresh and signing behavior;
- never include real credentials, tokens, account IDs, or private infrastructure details in fixtures.

## Local development

```bash
npm install
npm run typecheck
npm test
npm run build
```

## Pull requests

Prefer small, focused changes. Explain security-sensitive behavior explicitly in the PR description.

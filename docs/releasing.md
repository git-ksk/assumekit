# Release and npm publishing

AssumeKit uses two release phases because npm Trusted Publishing can only be configured for a package that already exists on the npm registry.

- **First publish only:** bootstrap the package manually with interactive npm authentication/2FA after the real Cloud Run → AWS E2E release gate (#5) is closed.
- **All later publishes:** use GitHub Actions OIDC Trusted Publishing through `.github/workflows/publish.yml`. No long-lived npm publish token is required.

Do not publish any version until #5 is closed and the exact release commit has green CI.

## Release invariants

- Release commits must be contained in `main`.
- Git tags must exactly match `v` + `package.json` version, for example `v0.1.0-alpha.0`.
- Prereleases use npm dist-tags automatically: `alpha`, `beta`, `rc`, or `next`; stable versions use `latest`.
- High-severity dependency audit findings, type errors, test failures, build failures, or package-shape failures block publishing.
- The release workflow uses GitHub-hosted runners, `id-token: write`, pinned GitHub Actions SHAs, no dependency cache, and npm provenance.

## First publish bootstrap

Current npm Trusted Publishing cannot bootstrap a package name that does not yet exist. The npm `trust` command also requires the package to already exist.

For the first publish only:

1. Confirm #5 is closed and CI is green on the exact `main` commit to release.
2. From a clean checkout of that commit, run:

   ```bash
   npm ci --ignore-scripts
   npm audit --audit-level=high
   npm run typecheck
   npm test
   npm run build
   npm pack --dry-run
   ```

3. Authenticate interactively to npm with the maintainer account and 2FA. Do not create or store a long-lived automation token just to bootstrap the package.
4. Confirm `package.json` version and publish the alpha with the matching prerelease dist-tag, for example:

   ```bash
   npm publish --access public --tag alpha
   ```

5. Immediately configure npm Trusted Publishing for the now-existing package:
   - Provider: GitHub Actions
   - GitHub organization/user: `git-ksk`
   - Repository: `assumekit`
   - Workflow filename: `publish.yml`
   - Environment: `npm`
   - Allowed action: `npm publish`
6. In npm package settings, require 2FA and disallow traditional publish tokens once Trusted Publishing is verified.
7. Create/protect a GitHub `npm` environment. Approval protection is recommended for releases.

The bootstrap publish is the only exception to the OIDC-only release path. Do not keep a bootstrap token or a second token-based publish workflow.

## Normal OIDC release

After Trusted Publishing is configured:

1. Bump `package.json` version in a reviewed PR and merge it to `main` with green CI.
2. Create a tag matching the version exactly, e.g. `v0.1.0-alpha.1`.
3. Publish the corresponding GitHub Release.
4. The `Publish Package` workflow will:
   - check out the release tag;
   - verify #5 is closed;
   - verify the tagged commit is contained in `main`;
   - verify the tag matches `package.json` version;
   - refuse to run if the package still does not exist on npm;
   - run dependency audit, typecheck, tests, build, and `npm pack --dry-run`;
   - publish with the appropriate npm dist-tag using OIDC Trusted Publishing and provenance.

No `NPM_TOKEN` is required by `publish.yml`.

## Failure safety

A failed release workflow should be diagnosed rather than bypassed.

- If #5 is open, complete the real-cloud E2E; do not remove the gate.
- If the tag/version mismatch, fix the release metadata rather than publishing a different tree.
- If the package does not exist, use the one-time bootstrap procedure above.
- If OIDC authentication fails, verify the npm Trusted Publisher fields exactly match `git-ksk/assumekit`, `publish.yml`, and environment `npm`.
- If CI validation fails, fix the code/dependencies before retrying the release.

## Supply-chain notes

The repository pins GitHub Actions to immutable commit SHAs. Dependabot may propose newer major versions; review the upstream release and CI results before updating the pinned SHA.

Trusted Publishing requires a supported GitHub-hosted runner and `id-token: write`. npm automatically associates provenance with trusted GitHub Actions publishes; the workflow also requests provenance explicitly.

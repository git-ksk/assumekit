# Release / npm publish 手順

AssumeKit は、npm Trusted Publishing が**既に npm registry 上に存在する package**にしか設定できない制約があるため、release を2段階に分けます。

- **初回publishだけ:** 実 Cloud Run → AWS E2E release gate (#5) をcloseした後、interactiveなnpm認証/2FAでpackageをbootstrapする。
- **2回目以降:** `.github/workflows/publish.yml` から GitHub Actions OIDC Trusted Publishing を使う。長期npm publish tokenは不要。

#5がcloseされ、release対象commitのCIがgreenになるまではpublishしません。

## Releaseの不変条件

- release対象commitは `main` に含まれていること。
- Git tagは `v` + `package.json` versionと完全一致させる。例: `v0.1.0-alpha.0`。
- prereleaseは自動的に `alpha` / `beta` / `rc` / `next` のnpm dist-tagを使い、stable版だけ `latest` を使う。
- high severity dependency audit、typecheck、test、build、package内容確認のどれかが失敗したらpublishしない。
- release workflowはGitHub-hosted runner、`id-token: write`、GitHub Actionsのcommit SHA pin、dependency cacheなし、npm provenance付きで実行する。

## 初回publishのbootstrap

現行npmでは、存在しないpackage名へTrusted Publisherを先に設定できません。`npm trust` もpackageが既に存在することを要求します。

初回publishだけ次の手順を使います。

1. #5がcloseされ、release対象の正確な `main` commitでCIがgreenなことを確認する。
2. そのcommitのclean checkoutで次を実行する。

   ```bash
   npm ci --ignore-scripts
   npm audit --audit-level=high
   npm run typecheck
   npm test
   npm run build
   npm pack --dry-run
   ```

3. maintainerのnpm accountへinteractiveにloginし、2FAを使用する。package bootstrapのためだけに長期automation tokenを作成・保存しない。
4. `package.json` versionを確認し、対応するprerelease dist-tagで初回alphaをpublishする。例:

   ```bash
   npm publish --access public --tag alpha
   ```

5. package作成直後にnpm Trusted Publishingを設定する。
   - Provider: GitHub Actions
   - GitHub organization/user: `git-ksk`
   - Repository: `assumekit`
   - Workflow filename: `publish.yml`
   - Environment: `npm`
   - Allowed action: `npm publish`
6. Trusted Publishingの動作確認後、npm package settingsで2FAを必須化し、traditional publish tokenを無効化する。
7. GitHub側に `npm` Environmentを作成・保護する。release時のapproval protectionを推奨する。

bootstrap publishだけがOIDC-only release pathの例外です。bootstrap用tokenやtoken-based publish workflowを残しません。

## 通常のOIDC release

Trusted Publishing設定後は次の流れです。

1. `package.json` versionをreview済みPRで更新し、green CIで `main` にmergeする。
2. versionと完全一致するtagを作る。例: `v0.1.0-alpha.1`。
3. 対応するGitHub Releaseをpublishする。
4. `Publish Package` workflowが自動で次を確認・実行する。
   - release tagをcheckout
   - #5がclosedか確認
   - tagged commitが `main` に含まれるか確認
   - tagと `package.json` versionの完全一致確認
   - npm上にpackageがまだ無ければpublishを拒否
   - dependency audit / typecheck / test / build / `npm pack --dry-run`
   - 適切なnpm dist-tagでOIDC Trusted Publishing + provenance publish

`publish.yml` に `NPM_TOKEN` は不要です。

## Failure safety

release workflowが失敗した場合、gateを外さず原因を修正します。

- #5がopenなら実Cloud E2Eを完了する。
- tag/version不一致ならrelease metadataを修正し、別treeを無理にpublishしない。
- npm上にpackageが無ければ上記の1回限りのbootstrap手順を使う。
- OIDC認証に失敗したら、npm Trusted Publisher設定が `git-ksk/assumekit`、`publish.yml`、Environment `npm` と完全一致するか確認する。
- CI validationが失敗したらcode/dependencyを修正してからreleaseを再実行する。

## Supply-chainメモ

repository内のGitHub Actionsはimmutableなcommit SHAへpinします。Dependabotがmajor updateを提案した場合は、upstream release内容とCI結果を確認してからpin先SHAを更新します。

Trusted Publishingには対応したGitHub-hosted runnerと `id-token: write` が必要です。npmはTrusted Publishing経由のGitHub Actions publishにprovenanceを自動付与し、workflow側でもprovenanceを明示要求します。

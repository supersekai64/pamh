# Release

Use GitHub Actions for npm releases. The first publication of each package needs
a granular npm access token with 2FA bypass enabled because npm trusted
publishing can only be configured after the package exists. After the first
publish, configure trusted publishing and remove the token dependency from the
workflow.

## One-time npm setup

Before the first publish, create a GitHub Actions secret named `NPM_TOKEN` with
a granular npm access token that can publish public packages under the
`@helloworlkd` scope. The token owner must have publish rights for that npm
user or organization scope.

The npm scope must also exist before publishing. This project publishes under
the npm account scope `@helloworlkd`; use a token from that account, or rename
every package to use the npm account or organization scope that actually owns
the token.

When creating the token on npm:

- enable `Bypass two-factor authentication`;
- grant `Read and write` package permissions;
- select the `@helloworlkd` scope or all packages the account can publish;
- avoid IP allowlists for GitHub-hosted runners unless the ranges are maintained
  deliberately.

A token without 2FA bypass will fail in GitHub Actions with `EOTP` because npm
will request a one-time password during `npm publish`.

After each package exists on npm, open the package settings for
`@helloworlkd/pam-core`, `@helloworlkd/pam-ui`, `@helloworlkd/pam-api`,
`@helloworlkd/pam-protocol`, and `@helloworlkd/pam-cli`, then add this trusted
publisher:

- Publisher: GitHub Actions
- Repository: `supersekai64/pam`
- Workflow: `npm-publish.yml`
- Environment: leave empty

Keep package publishing access set to allow 2FA or trusted publishing. Once all
packages trust the workflow, `NPM_TOKEN` can be removed from the repository
secrets and from the workflow.

## Publish

1. Bump package versions and dependency ranges.
2. Run `pnpm release:check`.
3. Push to `main`.
4. Run the `npm publish` workflow from GitHub Actions.

The workflow publishes packages in dependency order and skips versions that already exist on npm.

The workflow uses `pnpm pack` / `pnpm publish` instead of `npm pack` /
`npm publish` so workspace dependency ranges are rewritten to concrete npm
versions in the published manifests. Keep `pnpm pack:check` in the release check
before publishing; it fails if a packed package still contains `workspace:`.

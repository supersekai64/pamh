# Release

Use GitHub Actions Trusted Publishing for npm releases. This avoids local 2FA prompts and avoids storing an npm token.

## One-time npm setup

For each published package (`pamh-core`, `pamh-ui`, `pamh-api`, `pamh-protocol`, `pamh-cli`), open the package settings on npm and add this trusted publisher:

- Publisher: GitHub Actions
- Repository: `supersekai64/pamh`
- Workflow: `npm-publish.yml`
- Environment: leave empty

Keep package publishing access set to allow 2FA or trusted publishing.

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

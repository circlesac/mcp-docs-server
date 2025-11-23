# Contributing

Thanks for helping improve `mcp-docs-server`! This document covers everything you need to work on the project locally.

## Prerequisites

- Node.js 18 or newer
- [Bun](https://bun.sh/) 1.1 or newer (used for dependency management and scripts)

## Install & Build

```bash
bun install
bun run build        # Compiles TypeScript to dist/ with tsconfig.build.json
```

Use `bun run dev` for the CLI entry point in watch-mode while you iterate.

## Quality Checks

- `bun run lint` – shared lint/formatting rules
- `bun run test` – runs Vitest with coverage enabled by default  
  Use `bunx vitest watch` for iterative test runs.

Tests include filesystem-heavy scenarios (see `tests/publish.memfs.test.ts`) that rely on `memfs`; make sure fixtures under `tests/__fixtures__` stay in sync when updating docs/templates.

## Testing

### Automated

- `bun run build` – compiles `src/` with `tsconfig.build.json`
- `bun run lint` – shared lint/format rules via `@circlesac/lint`
- `bun run test` – Vitest with coverage (artifacts in `coverage/`)

### Manual smoke checks

1. Serve locally
   - Create a docs repo with `docs/` and `mcp-docs-server.json` (see README example).
   - Run `npx @circlesac/mcp-docs-server serve` inside the repo and confirm responses over STDIO.
2. Inspect publish output
   - `npx @circlesac/mcp-docs-server publish --output ./package-build` to stage the npm package locally.
   - Review `./package-build` (docs, config, wrapper) before publishing.
3. Build Cloudflare Worker
   - `npx @circlesac/mcp-docs-server cloudflare --dry-run` to prepare build directory without deploying.
   - `npx @circlesac/mcp-docs-server cloudflare --account-id <id>` to build and deploy to Cloudflare.
4. Optional npm publish dry run
   - `cd ./package-build && npm publish --access restricted --dry-run` to verify metadata without pushing.

## Versioning & Releases

1. Bump the version in both `package.json` and `mcp-docs-server.json` (the publish script enforces that they match via `scripts/check-version.ts`).
2. Run `bun run build`, `bun run lint`, and `bun run test`.
3. Publish with your preferred npm workflow. The `prepublishOnly` script will rebuild and verify version alignment automatically.

## Documentation

End-user docs live under `docs/`. If you add or restructure documentation, confirm the bundled templates continue to render correctly by running `bun run dev` or `bun run build` and using the `serve` workflow.

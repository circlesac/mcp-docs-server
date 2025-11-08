# Publishing Workflow

The `publish` command packages your docs and config into an installable npm module. The module embeds a thin wrapper that boots the MCP server from the bundled assets.

## Dry run

```bash
npx @circlesac/mcp-docs-server publish --output ./package-build
```

This copies the generated package into `./package-build` so you can review it. Nothing is published.

## Real publish

```bash
npx @circlesac/mcp-docs-server publish
```

- Reads `mcp-docs-server.json`.
- Copies the configured docs folder.
- Copies `.npmrc` if it exists next to your `mcp-docs-server.json`.
- Generates `bin/stdio.js` that boots the server.
- Produces a `package.json` targeting `@circlesac/mcp-docs-server` as a dependency.
- Runs `npm publish --access restricted`.

Ensure you are authenticated with npm and have permission to publish under the configured package scope.

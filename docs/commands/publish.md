# The `publish` Command

The `publish` command packages your docs and config into an installable npm module. The module embeds a thin wrapper that boots the MCP server from the bundled assets. This allows you to distribute your documentation as a versioned npm package that others can install and use.

## Quick Start

From your project directory:

```bash
npx @circlesac/mcp-docs-server publish
```

This reads your `mcp-docs-server.json`, packages everything, and publishes to npm.

## Dry Run

Before publishing, you can preview what will be packaged:

```bash
npx @circlesac/mcp-docs-server publish --output ./package-build
```

This copies the generated package into `./package-build` so you can review it. Nothing is published to npm.

## Command Options

### `--output <dir>` or `-o <dir>`

Stage the npm package in a directory instead of publishing:

```bash
npx @circlesac/mcp-docs-server publish --output ./package-build
```

This acts like a dry-run that writes the package to `<dir>` without publishing.

## What Gets Published

The `publish` command:

1. Reads `mcp-docs-server.json` from your current directory
2. Copies the configured `docs/` folder
3. Copies `.npmrc` if it exists next to your `mcp-docs-server.json` (for registry/auth settings)
4. Generates `bin/stdio.js` that boots the server
5. Produces a `package.json` targeting `@circlesac/mcp-docs-server` as a dependency
6. Runs `npm publish --access restricted` (unless `--output` is used)

## Publishing Requirements

- Ensure you are authenticated with npm (`npm login`)
- Have permission to publish under the configured package scope
- Version in `mcp-docs-server.json` must match `package.json` (if present)

> **Note:** Place a `.npmrc` next to your `mcp-docs-server.json` if you want to control default npm publish behavior (e.g., registry, auth, tag, access). It will be copied into the generated package automatically.

## Installing Published Packages

Once published, users can install your package and configure it in their MCP client:

```json
{
  "mcpServers": {
    "acme-docs": {
      "command": "npx",
      "args": ["-y", "@acme/mcp-docs-server"]
    }
  }
}
```

The `-y` flag automatically accepts the npx prompt. The MCP client will use the dynamically generated tool name (for example, `searchMcpDocsServer` for this package, or `searchAcme` based on your config's `name` field) to query your documentation.

## Create an "Add to Cursor" Button

MCP servers can be installed with Cursor deeplinks. See the [official Cursor documentation](https://cursor.com/docs/context/mcp/install-links) for MCP install links.

The markdown example below is recommended over static badges, and automatically adapts to light/dark theme:

```markdown
<a href="https://cursor.com/en-US/install-mcp?name=acme-docs&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBhY21lL21jcC1kb2NzLXNlcnZlciJdfQ%3D%3D">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cursor.com/deeplink/mcp-install-light.svg">
    <img src="https://cursor.com/deeplink/mcp-install-dark.svg" alt="Add to Cursor">
  </picture>
</a>
```

Replace `acme-docs` with your desired server name and base64-encode your config JSON for the `config` parameter.

## Related Documentation

- [Getting Started](../getting-started.md) - Learn the basics of setting up your docs
- [Configuration Reference](../configuration.md) - Understand the config file format
- [The `serve` Command](./serve.md) - Run locally without publishing
- [The `cloudflare` Command](./cloudflare.md) - Deploy as a remote MCP server

# Configuration Reference

`mcp-docs-server.json` is the only required configuration file. It lives next to your `docs/` directory. Throughout the docs we call the product `mcp-docs-server`; when you publish, use whatever npm scope fits your org (the default package we ship is `@circlesac/mcp-docs-server`).

## Configuration Fields

| Field     | Type   | Required | Description                                                 |
| --------- | ------ | -------- | ----------------------------------------------------------- |
| `name`    | string | ✓        | Human label surfaced by the MCP server.                     |
| `package` | string | ✓        | npm package name used when publishing. Supports scopes.     |
| `version` | string | ✓        | npm version published by the `publish` command.             |
| `docs`    | string | –        | Relative folder containing Markdown (defaults to `"docs"`). |

### Example

```json
{
  "name": "Acme Documentation Server",
  "package": "@acme/mcp-docs-server",
  "version": "0.1.0",
  "docs": "docs"
}
```

## How It Works

The CLI intentionally keeps configuration minimal to reduce complexity and maintenance overhead. Here's what this means in practice:

- **Single doc root**: One `docs` directory per config file keeps paths predictable and avoids merge conflicts. You can organize content with any number of subfolders (e.g., `docs/guides/`, `docs/reference/`).
- **Security boundaries**: Path traversal attempts (`..` segments) are rejected to prevent access outside the configured doc root.
- **Auto-generated metadata**: Tool title and description are derived from the `name` field using a template, ensuring consistency without manual copy.
- **Deterministic tool name**: The CLI derives the MCP tool name from your `name` field (for example, `searchAcme`), falling back to `searchDocs` only if it can't generate a value.

## Common Questions

- **Can I keep multiple sections inside one package?** Yes. Arrange as many subfolders as you like under `docs/` (for example `docs/guides/`, `docs/reference/`).
- **What if I need multiple top-level doc roots?** Create another package for each set. Keeping the config minimal is a feature—separate packages keep each doc collection focused and independently versioned.

## Related Documentation

- [Getting Started](./getting-started.md) - Learn how to set up your first docs server
- [The `serve` Command](./commands/serve.md) - Use this config for local development
- [The `publish` Command](./commands/publish.md) - Use this config when publishing to npm
- [The `cloudflare` Command](./commands/cloudflare.md) - Use this config when deploying to Cloudflare

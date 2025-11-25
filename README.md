# mcp-docs-server

> Share your knowledge as an MCP server.

Have Markdown files (knowledge) you want to share across workspaces or your company? Run them as an MCP docs server so agents can answer directly from your content.

Make your Markdown docs feel alive in coding agents like Cursor and Claude. Add reusable prompt templates to guide users through common workflows. When you're ready to roll it out to your team, publish as an npm package for consistent installs—everyone gets the same version with zero extra setup.

> Inspired by Mastra’s excellent [Mastra Docs Server](https://mastra.ai/docs/getting-started/mcp-docs-server), which shows how powerful doc-focused MCP servers can be.

If you're using Cursor, click "Add to Cursor" below to add the `mcp-docs-server` documentation with one click.

<!-- Primary CTA: Add to Cursor -->
<a href="https://cursor.com/en-US/install-mcp?name=mcp-docs-server&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBjaXJjbGVzYWMvbWNwLWRvY3Mtc2VydmVyIl19">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cursor.com/deeplink/mcp-install-light.svg" />
    <img src="https://cursor.com/deeplink/mcp-install-dark.svg" alt="Add to Cursor" />
  </picture>
</a>

Or add this configuration to your MCP server settings:

```json
{
  "mcpServers": {
    "mcp-docs-server": {
      "command": "npx",
      "args": ["-y", "@circlesac/mcp-docs-server"]
    }
  }
}
```

## Get started

To get up and running quickly, start with the [Getting Started guide](docs/getting-started.md). It walks through the simple two-file setup and overview of all three deployment modes.

### Three ways to serve your docs

- **Local STDIO** - Use [`serve`](docs/commands/serve.md) for local development
- **npm Package** - Use [`publish`](docs/commands/publish.md) to distribute via npm
- **Cloudflare Worker** - Use [`cloudflare`](docs/commands/cloudflare.md) for remote deployment

See the [Commands Overview](docs/commands/index.md) for a comparison and detailed guides. For configuration options, see the [Configuration Reference](docs/configuration.md). Learn how to create [reusable prompt templates](docs/prompts.md) for common workflows. Full documentation: [docs/index.md](docs/index.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, testing, and release notes.

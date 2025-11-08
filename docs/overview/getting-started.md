# Getting Started with `@circlesac/mcp-docs-server`

Have a bunch of documents you want to share? If they're in Markdown format, you came to the right place. Spin up a simple MCP documentation server using `@circlesac/mcp-docs-server`.

## Serve your own docs

1. Create a repo containing Markdown under `docs/`.
2. Add a minimal `mcp-docs-server.json` beside it:

   ```json
   {
     "name": "Acme Docs Server",
     "package": "@acme/mcp-docs-server",
     "version": "0.1.0"
   }
   ```

3. Run:

   ```bash
   npx @circlesac/mcp-docs-server serve
   ```

   This loads the config from your current working directory.

## Configure locally (without publishing)

You can use the CLI directly with `--config` and `--docs` options without publishing to npm:

```json
{
  "mcpServers": {
    "acme-docs": {
      "command": "npx",
      "args": ["-y", "@circlesac/mcp-docs-server", "serve", "--config", "/path/to/mcp-docs-server.json", "--docs", "/path/to/docs"]
    }
  }
}
```

If you are running the CLI from the project root in your terminal, you can omit these overrides entirely:

```bash
npx @circlesac/mcp-docs-server serve
```

Or use relative paths from your project root:

```json
{
  "mcpServers": {
    "acme-docs": {
      "command": "npx",
      "args": ["-y", "@circlesac/mcp-docs-server", "serve", "--config", "./mcp-docs-server.json", "--docs", "./docs"]
    }
  }
}
```

## Publish

Use `publish` to package everything into an npm module. Pass `--output <dir>` to override the output path (acts like a dry-run that writes the package to `<dir>` without publishing).

> Note: Place a `.npmrc` next to your `mcp-docs-server.json` if you want to control default npm publish behavior (e.g., registry, auth, tag, access). It will be copied into the generated package automatically.

## Configure the published version

For a published npm package like `@acme/mcp-docs-server`, add it to your MCP server settings:

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

The `-y` flag automatically accepts the npx prompt. Cursor will use the `searchDocs` tool to query your documentation.

## Create an "Add to Cursor" button

MCP servers can be installed with Cursor deeplinks.

See the official Cursor documentation for MCP install links: https://cursor.com/docs/context/mcp/install-links

The markdown example below is recommended over the static badges, and automatically adapts to light/dark theme:

```markdown
<a href="https://cursor.com/en-US/install-mcp?name=acme-docs&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBhY21lL21jcC1kb2NzLXNlcnZlciJdfQ%3D%3D">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cursor.com/deeplink/mcp-install-dark.svg">
    <img src="https://cursor.com/deeplink/mcp-install-light.svg" alt="Add to Cursor">
  </picture>
</a>
```

# The `serve` Command

The `serve` command starts a local MCP documentation server using STDIO. This is the simplest way to use `mcp-docs-server` for local development and testing.

## Quick Start

From your project directory with `docs/` and `mcp-docs-server.json`:

```bash
npx @circlesac/mcp-docs-server serve
```

This loads the config from your current working directory and starts the server.

## Command Options

### `--config <path>` or `-c <path>`

Specify a custom path to your `mcp-docs-server.json` file:

```bash
npx @circlesac/mcp-docs-server serve --config /path/to/mcp-docs-server.json
```

### `--docs <path>` or `-d <path>`

Override the docs directory path (takes precedence over the `docs` field in your config):

```bash
npx @circlesac/mcp-docs-server serve --docs /path/to/docs
```

## MCP Client Configuration

### Using npx (Recommended)

Configure your MCP client to use the CLI directly:

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

If you're running from the project root, you can omit the overrides:

```json
{
  "mcpServers": {
    "acme-docs": {
      "command": "npx",
      "args": ["-y", "@circlesac/mcp-docs-server", "serve"]
    }
  }
}
```

Or use relative paths:

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

### Using Source Code

If you've cloned the repository and want to use the source code directly:

1. Clone and install:

   ```bash
   git clone https://github.com/circlesac/mcp-docs-server.git
   cd mcp-docs-server
   bun install
   ```

2. Configure your MCP server:

   ```json
   {
     "mcpServers": {
       "acme-docs": {
         "command": "bun",
         "args": ["run", "/path/to/mcp-docs-server/src/cli.ts", "serve", "--config", "/path/to/mcp-docs-server.json", "--docs", "/path/to/docs"]
       }
     }
   }
   ```

   Replace `/path/to/mcp-docs-server` with the actual path to your cloned repository.

## How It Works

The `serve` command:

1. Loads your `mcp-docs-server.json` configuration (see [Configuration Reference](../configuration.md))
2. Reads your Markdown files from the configured `docs/` directory
3. Starts an MCP server over STDIO that responds to documentation queries
4. Generates a tool name from your config's `name` field (e.g., `searchAcme`)

The server runs until the MCP client disconnects. All communication happens over STDIO, making it perfect for local development.

## Next Steps

- Learn about [publishing to npm](../commands/publish.md) for team distribution
- Deploy as a [Cloudflare Worker](../commands/cloudflare.md) for remote access
- Review the [configuration options](../configuration.md) for advanced setup

# The `cloudflare` Command

The `cloudflare` command builds and deploys your documentation as a Cloudflare Worker, creating a remote MCP server accessible over HTTP. This is ideal for sharing documentation across teams or making it available without requiring local installation.

## Quick Start

From your project directory:

```bash
npx @circlesac/mcp-docs-server cloudflare
```

This builds and deploys your docs as a Cloudflare Worker.

## Dry Run

Preview the build without deploying:

```bash
npx @circlesac/mcp-docs-server cloudflare --dry-run
```

This prepares the build directory at `.build/cloudflare/` without deploying. You can review the generated files and test locally with `wrangler dev`.

## Command Options

### `--output <dir>` or `-o <dir>`

Override the output directory (default: `.build/cloudflare/`):

```bash
npx @circlesac/mcp-docs-server cloudflare --output ./my-build
```

### `--dry-run`

Prepare the build directory without deploying:

```bash
npx @circlesac/mcp-docs-server cloudflare --dry-run
```

### `--account-id <id>`

Specify your Cloudflare account ID for deployment:

```bash
npx @circlesac/mcp-docs-server cloudflare --account-id YOUR_ACCOUNT_ID
```

## What Gets Built

The `cloudflare` command:

1. Reads `mcp-docs-server.json` from your current directory
2. Copies your `docs/` folder to the build directory
3. Copies the config file and templates
4. Copies necessary source files (`config.ts`, `logger.ts`, `tools/docs.ts`, `utils.ts`)
5. Generates `package.json` with required dependencies
6. Generates `wrangler.json` with worker configuration
7. Installs dependencies with `npm install`
8. Generates TypeScript types with `wrangler types`
9. Deploys to Cloudflare Workers (unless `--dry-run` is used)

## Local Development

After a dry run, you can test locally:

```bash
cd .build/cloudflare
npx wrangler dev
```

This starts a local development server that mimics the Cloudflare Worker environment.

## Deployment Requirements

- Cloudflare account with Workers enabled
- `wrangler` CLI authenticated (`npx wrangler login`)
- Account ID (can be provided via `--account-id` or configured in `wrangler.json`)

## Worker Configuration

The command generates a `wrangler.json` file based on:

- Your `mcp-docs-server.json` config (worker name is derived from the `package` field)
- Root `wrangler.json` template (if present in the package)
- Any `--account-id` override

The worker name is automatically sanitized from your package name to be a valid Cloudflare Worker identifier.

## MCP Client Configuration

Once deployed, configure your MCP client to use the remote server. The exact configuration depends on your MCP client's support for HTTP-based MCP servers. Refer to your MCP client's documentation for remote server setup.

## Build Directory Structure

After building, your `.build/cloudflare/` directory contains:

```
.build/cloudflare/
├── docs/                    # Your documentation files
├── src/
│   ├── index.ts            # Cloudflare Worker entrypoint
│   ├── config.ts           # Configuration loader
│   ├── logger.ts           # Logging utilities
│   ├── tools/
│   │   └── docs.ts         # Documentation tool implementation
│   └── utils.ts            # Utility functions
├── templates/              # MDX templates
├── mcp-docs-server.json    # Your config file
├── package.json            # Generated dependencies
├── wrangler.json           # Cloudflare Worker config
└── worker-configuration.d.ts  # Generated TypeScript types
```

## Related Documentation

- [Getting Started](../getting-started.md) - Learn the basics of setting up your docs
- [Configuration Reference](../configuration.md) - Understand the config file format
- [The `serve` Command](./serve.md) - Run locally with STDIO
- [The `publish` Command](./publish.md) - Package for npm distribution

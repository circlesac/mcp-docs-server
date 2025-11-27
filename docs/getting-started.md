# Getting Started

`mcp-docs-server` makes it easy to share your Markdown documentation as an MCP server. The setup is simple: just two files.

## Two Files, That's It

1. **`docs/`** - A directory containing your Markdown files
2. **`mcp-docs-server.json`** - A minimal configuration file

That's all you need to get started. Optionally, you can also add:

- A `prompts/` directory to create reusable prompt templates (see [Prompts](./prompts.md))
- A `resources/` directory to expose any file type as browsable MCP resources (see [Resources](./resources.md))

## Quick Setup

1. Create a `docs/` directory with your Markdown files:

   ```
   my-project/
   ├── docs/
   │   ├── index.md
   │   ├── guides/
   │   │   └── intro.md
   │   └── reference/
   │       └── api.md
   ├── prompts/          # Optional: prompt templates
   │   └── setup-guide.md
   ├── resources/        # Optional: browsable resources
   │   └── templates.json
   └── mcp-docs-server.json
   ```

2. Create `mcp-docs-server.json` next to your `docs/` directory:

   ```json
   {
     "name": "My Project Docs",
     "package": "@myorg/my-project-docs",
     "version": "0.1.0"
   }
   ```

3. Choose how to use it:
   - **Local development**: Run [`serve`](./commands/serve.md) to start a local MCP server
   - **Team distribution**: Use [`publish`](./commands/publish.md) to package and publish to npm
   - **Remote access**: Deploy with [`cloudflare`](./commands/cloudflare.md) as a Cloudflare Worker

## Three Ways to Use Your Docs

### 1. Local STDIO (Development)

Perfect for local development and testing. The `serve` command starts an MCP server over STDIO:

```bash
npx @circlesac/mcp-docs-server serve
```

See [The `serve` Command](./commands/serve.md) for details.

### 2. npm Package (Distribution)

Package your docs as an npm module for easy installation and versioning:

```bash
npx @circlesac/mcp-docs-server publish
```

See [The `publish` Command](./commands/publish.md) for details.

### 3. Cloudflare Worker (Remote)

Deploy your docs as a remote MCP server accessible over HTTP:

```bash
npx @circlesac/mcp-docs-server cloudflare
```

See [The `cloudflare` Command](./commands/cloudflare.md) for details.

## Configuration

The `mcp-docs-server.json` file is simple. See the [Configuration Reference](./configuration.md) for all available options.

## Next Steps

- Learn about [configuration options](./configuration.md)
- Create [reusable prompt templates](./prompts.md) for common tasks
- Expose [files as browsable resources](./resources.md) for any file type
- Explore the [command documentation](./commands/serve.md) for detailed usage
- Check out the [full documentation index](./index.md)

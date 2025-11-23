# Commands

`mcp-docs-server` provides three commands for different deployment modes. Choose the one that fits your use case.

## Available Commands

### [`serve`](./serve.md)

Start a local MCP documentation server using STDIO. Perfect for local development and testing.

```bash
npx @circlesac/mcp-docs-server serve
```

**Use when:**

- Developing locally
- Testing your documentation setup
- Quick iteration without publishing

See [The `serve` Command](./serve.md) for details.

### [`publish`](./publish.md)

Package your docs and config into an installable npm module. Distribute your documentation as a versioned npm package.

```bash
npx @circlesac/mcp-docs-server publish
```

**Use when:**

- Sharing documentation with your team
- Versioning your docs
- Distributing via npm registry

See [The `publish` Command](./publish.md) for details.

### [`cloudflare`](./cloudflare.md)

Build and deploy your documentation as a Cloudflare Worker. Create a remote MCP server accessible over HTTP.

```bash
npx @circlesac/mcp-docs-server cloudflare
```

**Use when:**

- Deploying a remote MCP server
- Sharing docs across teams without npm
- Hosting documentation as a service

See [The `cloudflare` Command](./cloudflare.md) for details.

## Choosing a Command

| Command      | Deployment        | Best For                      |
| ------------ | ----------------- | ----------------------------- |
| `serve`      | Local STDIO       | Development, testing          |
| `publish`    | npm package       | Team distribution, versioning |
| `cloudflare` | Cloudflare Worker | Remote access, hosting        |

## Related Documentation

- [Getting Started](../getting-started.md) - Quick setup guide
- [Configuration Reference](../configuration.md) - Config file options
- [Documentation Index](../index.md) - Full documentation overview

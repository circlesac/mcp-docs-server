# Circles MCP Docs Server

Welcome to the bundled documentation for `mcp-docs-server`. This server is shipped with the CLI so you can kick the tires immediately.

## Overview

`mcp-docs-server` lets you share your Markdown documentation as an MCP (Model Context Protocol) server. With just two files—a `docs/` directory and a `mcp-docs-server.json` config file—you can make your documentation accessible to coding agents like Cursor and Claude.

## Three Deployment Modes

The tool supports three ways to serve your documentation:

1. **Local STDIO** - Run [`serve`](./commands/serve.md) for local development and testing
2. **npm Package** - Use [`publish`](./commands/publish.md) to package and distribute via npm
3. **Cloudflare Worker** - Deploy with [`cloudflare`](./commands/cloudflare.md) for remote HTTP access

## Documentation Structure

### Getting Started

- **[Getting Started](./getting-started.md)** - Quick introduction: the "two files" concept and overview of all three modes

### Configuration

- **[Configuration Reference](./configuration.md)** - Complete reference for `mcp-docs-server.json` settings

### Commands

- **[Commands Overview](./commands/index.md)** - Overview of all available commands
- **[The `serve` Command](./commands/serve.md)** - Local STDIO server for development
- **[The `publish` Command](./commands/publish.md)** - Package and publish to npm
- **[The `cloudflare` Command](./commands/cloudflare.md)** - Build and deploy as Cloudflare Worker

## Quick Reference

| Document                                | Description                          |
| --------------------------------------- | ------------------------------------ |
| [Getting Started](./getting-started.md) | Introduction and quick setup guide   |
| [Configuration](./configuration.md)     | Configuration file reference         |
| [Commands](./commands/index.md)         | Overview of all commands             |
| [serve](./commands/serve.md)            | Local STDIO server command           |
| [publish](./commands/publish.md)        | npm package publishing command       |
| [cloudflare](./commands/cloudflare.md)  | Cloudflare Worker deployment command |

## Using This Documentation

Use the MCP client of your choice to query this server. Paths available here mirror the structure inside the `docs/` directory. Explore further by requesting any of the paths above via the `searchMcpDocsServer` tool.

## Related Links

- All documentation is cross-linked for easy navigation
- Each command document links to related commands and configuration
- The configuration reference explains how settings apply across all modes

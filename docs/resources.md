# Resources

`mcp-docs-server` supports MCP resources, allowing you to expose any file type (JSON, images, configs, binaries, etc.) as browsable resources that clients can access via URIs.

## Overview

Resources provide a way to expose files directly to MCP clients, enabling them to browse and access files without needing to know exact paths. Unlike `docs/` (markdown-only) and `prompts/` (markdown/MDX-only), the `resources/` directory can contain **any file type**.

Resources are perfect for:

- Exposing JSON schemas, configuration files, or API specs
- Sharing images, icons, or other binary assets
- Providing structured data files (CSV, YAML, etc.)
- Making any file type browsable through MCP clients

## Quick Start

Create a `resources/` directory in your project root (same level as `docs/` and `mcp-docs-server.json`). Add a `templates.json` file to define URI templates for your resources.

```
my-project/
├── docs/
├── prompts/
├── resources/
│   ├── templates.json
│   └── config/
│       └── schemas/
│           └── my-config.schema.json
└── mcp-docs-server.json
```

## Directory Structure

Resources are organized following the pattern `/resources/<schema>/<host>/<...paths>/<filename>`:

```
resources/
├── templates.json          # URI template definitions
├── <schema>/
│   └── <host>/
│       └── <...paths>/
│           └── <filename>
```

**Example:**

```
resources/
├── templates.json
└── config/
    └── schemas/
        ├── my-config.schema.json
        └── my-config.example.json
```

## Template Configuration

The `resources/templates.json` file defines URI templates that map filesystem paths to resource URIs. This file contains an array of template objects:

```json
[
  {
    "uriTemplate": "config://schemas/{filename}",
    "name": "JSON Schema Resources",
    "description": "JSON schema files for configuration",
    "mimeType": "application/schema+json"
  }
]
```

### Template Fields

- **`uriTemplate`** (required): URI template following [RFC 6570](https://tools.ietf.org/html/rfc6570). Variables are enclosed in `{}` (e.g., `{filename}`, `{version}`)
- **`name`** (required): Human-readable name for this resource type
- **`description`** (optional): Description of what these resources are for
- **`mimeType`** (optional): MIME type for all resources matching this template

### URI Template Examples

**Single variable:**

```json
{
  "uriTemplate": "config://schemas/{filename}",
  "name": "Configuration Schemas"
}
```

- Filesystem: `/resources/config/schemas/my-config.schema.json`
- URI: `config://schemas/my-config.schema.json`
- Variables: `filename=my-config.schema.json`

**Multiple variables:**

```json
{
  "uriTemplate": "api://{version}/schemas/{category}/{name}.json",
  "name": "API Schemas"
}
```

- Filesystem: `/resources/api/v1/schemas/users/list.json`
- URI: `api://v1/schemas/users/list.json`
- Variables: `version=v1`, `category=users`, `name=list`

**Variable path segments:**

```json
{
  "uriTemplate": "docs://{version}/{...paths}",
  "name": "Documentation Resources"
}
```

- Filesystem: `/resources/docs/v2/guides/getting-started/intro.md`
- URI: `docs://v2/guides/getting-started/intro.md`
- Variables: `version=v2`, `paths=guides/getting-started/intro.md`

## MIME Type Detection

MIME types are determined in this priority order:

1. **Template `mimeType`**: If specified in `templates.json`, use that for all matching resources
2. **File extension**: Automatically detected using the `mime-types` library
3. **Fallback**:
   - Text files: `text/plain`
   - Binary files: `application/octet-stream`

## Example: JSON Schema Resources

Here's a complete example of exposing JSON schema files:

**1. Create the directory structure:**

```
resources/
├── templates.json
└── config/
    └── schemas/
        ├── mcp-docs-server.schema.json
        └── mcp-docs-server.example.json
```

**2. Define the template in `resources/templates.json`:**

```json
[
  {
    "uriTemplate": "config://schemas/{filename}",
    "name": "JSON Schema Resources",
    "description": "JSON schema files for mcp-docs-server configuration",
    "mimeType": "application/schema+json"
  }
]
```

**3. The files are now accessible as:**

- `config://schemas/mcp-docs-server.schema.json`
- `config://schemas/mcp-docs-server.example.json`

## File Type Support

Unlike `docs/` and `prompts/`, the `resources/` directory supports **any file type**:

- **Text files**: `.txt`, `.json`, `.yaml`, `.yml`, `.csv`, `.srt`, `.vtt`, etc.
- **Images**: `.png`, `.jpg`, `.svg`, `.gif`, etc.
- **Binary files**: `.bin`, `.dat`, etc.
- **Any other file type**

Resources are automatically read as UTF-8 text when possible, or as binary data when appropriate.

## Template Matching

When multiple templates could match the same file, the system uses **specificity rules** (similar to Hono's routing):

1. **More specific templates take precedence**:
   - Fixed segments (e.g., `.srt`) are more specific than variable paths (e.g., `{file}`)
   - Templates with fewer variables are more specific than those with more variables
2. **Order-based fallback**: If specificity is equal, the first template in the array wins

**Example:**

- Template 1: `youtube://{videoId}/{file}` (general)
- Template 2: `youtube://{videoId}/{language}.srt` (more specific, fixed extension)
- File: `/resources/youtube/dQw4w9WgXcQ/en.srt`
- Result: Matches Template 2 (more specific)

## Deployment

Resources work with all three deployment modes:

- **Local STDIO**: Resources are automatically loaded when you run `serve`
- **npm Package**: Resources are included when you run `publish`
- **Cloudflare Worker**: Resources are bundled when you run `cloudflare`

**Important**: Cloudflare Workers have package size limits (3 MB free, 10 MB paid after compression). Large resource files may cause deployment to exceed these limits. Consider using Workers KV, R2, or Static Assets for large binary files instead of bundling them.

## Best Practices

1. **Use descriptive template names**: Help users understand what each resource type is for
2. **Provide clear descriptions**: Explain when and why to use each resource type
3. **Specify MIME types**: Use template `mimeType` for better client handling
4. **Keep templates focused**: Each template should map to a logical group of files
5. **Consider file sizes**: Be mindful of Cloudflare Workers size limits for bundled resources
6. **Use meaningful URIs**: Design URI templates that are intuitive and discoverable

## Related

- [Getting Started](./getting-started.md) - Learn the basics of mcp-docs-server
- [Prompts](./prompts.md) - Create reusable prompt templates
- [Configuration](./configuration.md) - Configuration options
- [Commands](./commands/index.md) - Available commands

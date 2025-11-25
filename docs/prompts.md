# Prompts

`mcp-docs-server` supports MCP prompts, allowing you to create reusable prompt templates that clients can invoke with customizable arguments.

## Overview

Prompts provide a way to expose pre-formatted messages or templates that can be customized with arguments. They're perfect for:

- Creating guided workflows for users
- Providing template prompts for common tasks
- Offering context-aware assistance

## Quick Start

Create a `prompts/` directory in your project root (same level as `docs/` and `mcp-docs-server.json`). Any `.md` or `.mdx` files in this directory will be automatically discovered and registered as prompts.

```
my-project/
├── docs/
├── prompts/
│   ├── setup-guide.md
│   └── query-docs.mdx
└── mcp-docs-server.json
```

No configuration needed—if the `prompts/` folder exists, prompts are automatically loaded.

## Simple Prompts (No Arguments)

For prompts without arguments, use a regular `.md` file:

**`prompts/setup-guide.md`:**

```markdown
# Getting Started

I'm new to this project and need help getting started. Please guide me through:

1. What is this project?
2. How do I set it up?
3. What are the key concepts I should know?
```

This creates a prompt named `setup-guide` that clients can invoke without any arguments.

## Template Prompts (With Arguments)

For prompts that accept arguments, use `.mdx` files with YAML frontmatter:

**`prompts/query-docs.mdx`:**

```mdx
---
title: Query Documentation
description: Help users find information in the documentation
args:
  topic:
    type: string
    required: true
    description: The topic to search for
  context:
    type: string
    optional: true
    description: Additional context about the query
---

I need help finding information about {{topic}} in the documentation.

{{context}}

Please use the searchDocs tool to find relevant documentation.
```

This creates a prompt named `query-docs` that accepts:

- `topic` (required): A string argument
- `context` (optional): An optional string argument

## Frontmatter Format

The frontmatter uses YAML syntax with the following structure:

```yaml
---
title: Prompt Title
description: Brief description of what this prompt does
args:
  argument_name:
    type: string | number | boolean
    required: true | false
    optional: true | false
    description: What this argument is for
---
```

### Argument Types

- **`string`**: Text values (default)
- **`number`**: Numeric values
- **`boolean`**: True/false values

### Required vs Optional

- Set `required: true` for mandatory arguments
- Set `optional: true` for optional arguments
- If neither is set, the argument defaults to required

## Placeholders

Use `{{placeholder_name}}` syntax in your prompt content to insert argument values:

````mdx
---
title: Code Review
args:
  code:
    type: string
    required: true
  language:
    type: string
    optional: true
---

Review the following {{language}} code:

```{{language}}
{{code}}
```

Look for best practices and potential issues.
````

When the prompt is invoked with `code="const x = 1"` and `language="javascript"`, the placeholders are replaced with the actual values.

## Prompt Name Generation

Prompt names are automatically generated from filenames:

- `setup-guide.md` → `setup-guide`
- `query-docs.mdx` → `query-docs`
- `deploy-cloudflare.mdx` → `deploy-cloudflare`

## Validation

The system automatically validates that:

- All placeholders in the template have corresponding arguments defined in frontmatter
- Placeholder names are alphanumeric with underscores only (security)
- Argument types match the expected format

If validation fails, the prompt won't be registered and an error will be logged.

## Examples

### Example 1: Simple Welcome Prompt

**`prompts/welcome.md`:**

```markdown
# Welcome

Hello! I'm here to help you get started with this project.
```

### Example 2: Template with Required Arguments

**`prompts/generate-code.mdx`:**

```mdx
---
title: Generate Code
description: Generate code based on requirements
args:
  language:
    type: string
    required: true
    description: Programming language (e.g., "typescript", "python")
  task:
    type: string
    required: true
    description: What the code should do
---

Generate {{language}} code that {{task}}.

Make sure the code follows best practices and includes comments.
```

### Example 3: Template with Optional Arguments

**`prompts/deploy.mdx`:**

```mdx
---
title: Deploy Application
description: Guide through deployment process
args:
  environment:
    type: string
    required: true
    description: Deployment environment (e.g., "production", "staging")
  region:
    type: string
    optional: true
    description: AWS region (defaults to us-east-1 if not provided)
---

I want to deploy to {{environment}}.

{{region}}

Please guide me through the deployment process step by step.
```

## Deployment

Prompts work with all three deployment modes:

- **Local STDIO**: Prompts are automatically loaded when you run `serve`
- **npm Package**: Prompts are included when you run `publish`
- **Cloudflare Worker**: Prompts are bundled when you run `cloudflare`

No additional configuration needed—just create the `prompts/` directory and your prompts will be available.

## Best Practices

1. **Use descriptive titles**: Help users understand what each prompt does
2. **Provide clear descriptions**: Explain when and why to use each prompt
3. **Document arguments**: Use argument descriptions to guide users
4. **Keep prompts focused**: Each prompt should have a single, clear purpose
5. **Test your prompts**: Invoke them through your MCP client to ensure they work as expected

## Related

- [Getting Started](./getting-started.md) - Learn the basics of mcp-docs-server
- [Configuration](./configuration.md) - Configuration options
- [Commands](./commands/index.md) - Available commands

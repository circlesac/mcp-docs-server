import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { McpAgent } from "agents/mcp"
import type { DocsServerConfig } from "./config.js"
import { createDocsTool } from "./tools/docs.js"

// Export DocsMCP class for Durable Object binding
export class DocsMCP extends McpAgent<Env> {
	server!: McpServer

	async init() {
		const name = this.env.MCP_DOCS_SERVER_NAME
		const version = this.env.MCP_DOCS_SERVER_VERSION
		const toolName = this.env.MCP_DOCS_SERVER_TOOL_NAME
		const docsPath = this.env.MCP_DOCS_SERVER_DOCS_PATH
		const packageName = this.env.MCP_DOCS_SERVER_PACKAGE_NAME

		this.server = new McpServer({ name, version })

		const config: DocsServerConfig = {
			name,
			title: `${name} Documentation Server`,
			packageName,
			version,
			tool: toolName,
			description: `Get ${name} internal documentation.`,
			docRoot: {
				relativePath: docsPath,
				absolutePath: `/bundle/${docsPath}`
			},
			configPath: "/bundle/mcp-docs-server.json",
			rootDir: "/bundle",
			useReaddirMap: true,
			raw: {
				name,
				package: packageName,
				version,
				docs: docsPath
			}
		}
		const docsTool = await createDocsTool(config)
		this.server.registerTool(
			docsTool.name,
			{
				description: docsTool.description,
				inputSchema: docsTool.inputSchema
			},
			docsTool.callback
		)
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url)

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return DocsMCP.serveSSE("/sse").fetch(request, env, ctx)
		}

		if (url.pathname === "/mcp") {
			return DocsMCP.serve("/mcp").fetch(request, env, ctx)
		}

		return new Response("Not found", { status: 404 })
	}
}

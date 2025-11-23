import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { McpAgent } from "agents/mcp"
import { loadConfig } from "./config.js"
import { createDocsTool } from "./tools/docs.js"

// Load config from bundled mcp-docs-server.json at module level
// Template is also bundled at /bundle/templates/docs.mdx
const config = loadConfig({ configPath: "/bundle/mcp-docs-server.json", templatePath: "/bundle/templates/docs.mdx" })

// Export DocsMCP class for Durable Object binding
export class DocsMCP extends McpAgent<Env> {
	server = new McpServer({ name: config.name, version: config.version })

	async init() {
		const docsTool = await createDocsTool(config)
		this.server.registerTool(docsTool.name, docsTool.config, docsTool.cb)
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		try {
			const url = new URL(request.url)

			if (url.pathname === "/sse" || url.pathname === "/sse/message") {
				return DocsMCP.serveSSE("/sse").fetch(request, env, ctx)
			}

			if (url.pathname === "/mcp") {
				return DocsMCP.serve("/mcp").fetch(request, env, ctx)
			}

			return new Response("Not found", { status: 404 })
		} catch (error) {
			console.error("Error in fetch handler:", error)
			return new Response(`Error: ${error instanceof Error ? error.message : String(error)}`, {
				status: 500,
				headers: { "Content-Type": "text/plain" }
			})
		}
	}
}

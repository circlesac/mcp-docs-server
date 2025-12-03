import { StreamableHTTPTransport } from "@hono/mcp"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { Hono } from "hono"
import { registerPrompts } from "./handlers/prompts.js"
import { registerResources } from "./handlers/resources.js"
import { registerTools } from "./handlers/tools.js"
import { loadConfig } from "./utils/config.js"

// Load config from bundled mcp-docs-server.json at module level
// Template is also bundled at /bundle/templates/docs.mdx
const config = loadConfig({ configPath: "/bundle/mcp-docs-server.json", templatePath: "/bundle/templates/docs.mdx" })

// Create MCP server
const server = new McpServer({ name: config.name, version: config.version })
await registerTools(server, config)
await registerPrompts(server, config)
await registerResources(server, config)

// Create Hono app
const app = new Hono()

// Handle MCP requests at /mcp using StreamableHTTPTransport from @hono/mcp
app.all("/mcp", async (c) => {
	const transport = new StreamableHTTPTransport()
	await server.connect(transport)
	const response = await transport.handleRequest(c)
	return response || new Response("Internal Server Error", { status: 500 })
})

export default app

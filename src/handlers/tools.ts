import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { createDocsTool } from "../tools/docs.js"
import type { DocsServerConfig } from "../utils/config.js"

export async function registerTools(server: McpServer, config: DocsServerConfig): Promise<void> {
	const tool = await createDocsTool(config)
	server.registerTool(tool.name, tool.config, tool.cb)
}

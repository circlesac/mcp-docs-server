import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { DocsServerConfig } from "../config.js"
import { type LoadedPrompt, loadPrompts } from "./loader.js"

/**
 * Register all prompts from the prompts directory with the MCP server
 */
export async function registerPrompts(server: McpServer, config: DocsServerConfig): Promise<void> {
	const prompts = await loadPrompts(config.rootDir)

	for (const prompt of prompts) {
		server.registerPrompt(prompt.name, { title: prompt.title, description: prompt.description, argsSchema: prompt.argsSchema.shape }, prompt.callback)
	}
}

export type { LoadedPrompt }

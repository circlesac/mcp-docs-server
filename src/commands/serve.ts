import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { readPackageUp } from "read-package-up"

import { loadConfig } from "../config.js"
import { createLogger, logger } from "../logger.js"
import { createDocsTool } from "../tools/docs.js"

export interface RunServerOptions {
	configPath?: string
	cwd?: string
	docs?: string
}

export async function runServer(options: RunServerOptions = {}): Promise<void> {
	const server = await createServer(options)

	try {
		const transport = new StdioServerTransport()
		await server.connect(transport)
		const config = await loadConfig(options)
		await logger.info(`Started ${config.name}`)
	} catch (error) {
		await logger.error("Failed to start MCP docs server", error)
		throw error
	}
}

async function createServer(options: RunServerOptions = {}): Promise<McpServer> {
	const config = await loadConfig(options)

	const result = await readPackageUp()
	if (!result?.packageJson?.version) {
		throw new Error("package.json not found or missing version. This indicates a packaging error.")
	}
	const version = result.packageJson.version

	const docsTool = await createDocsTool(config)

	const server = new McpServer({
		name: config.name,
		version
	})

	server.registerTool(docsTool.name, docsTool.config, docsTool.cb)

	Object.assign(logger, createLogger(server))

	return server
}

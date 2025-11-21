import fs from "node:fs/promises"

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

import { getConfig, loadConfig } from "../config.js"
import { createLogger, logger } from "../logger.js"
import { createDocsTool } from "../tools/docs.js"
import { fromPackageRoot, getPackageRoot } from "../utils.js"

export interface RunServerOptions {
	configPath?: string
	cwd?: string
	docs?: string
}

async function createServer(options: RunServerOptions = {}): Promise<McpServer> {
	await loadConfig(options)
	const config = getConfig()

	const pkgJson = JSON.parse(await fs.readFile(fromPackageRoot(getPackageRoot(), "package.json"), "utf-8")) as { version?: string }
	const version = pkgJson.version ?? "0.0.0"

	const docsTool = await createDocsTool(config)

	const server = new McpServer({
		name: config.name,
		version
	})

	server.registerTool(
		docsTool.name,
		{
			description: docsTool.description,
			inputSchema: docsTool.inputSchema
		},
		docsTool.callback
	)

	Object.assign(logger, createLogger(server))

	return server
}

export async function runServer(options: RunServerOptions = {}): Promise<void> {
	const server = await createServer(options)

	try {
		const transport = new StdioServerTransport()
		await server.connect(transport)
		const config = getConfig()
		await logger.info(`Started ${config.name}`)
	} catch (error) {
		await logger.error("Failed to start MCP docs server", error)
		throw error
	}
}

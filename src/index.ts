import fs from "node:fs/promises"

import { MCPServer } from "@mastra/mcp"

import { getConfig, loadConfig } from "./config.js"
import { createLogger, logger } from "./logger.js"
import { createDocsTool } from "./tools/docs.js"
import { fromPackageRoot } from "./utils.js"

export interface RunServerOptions {
	configPath?: string
	cwd?: string
	docs?: string
}

async function createServer(options: RunServerOptions = {}): Promise<MCPServer> {
	await loadConfig(options)
	const config = getConfig()

	const pkgJson = JSON.parse(await fs.readFile(fromPackageRoot("package.json"), "utf-8")) as { version?: string }
	const version = pkgJson.version ?? "0.0.0"

	const docsTool = createDocsTool()

	const server = new MCPServer({
		name: config.name,
		version,
		tools: {
			[config.tool]: docsTool
		}
	})

	Object.assign(logger, createLogger(server))

	return server
}

export async function runServer(options: RunServerOptions = {}): Promise<void> {
	const server = await createServer(options)

	try {
		await server.startStdio()
		const config = getConfig()
		await logger.info(`Started ${config.name}`)
	} catch (error) {
		await logger.error("Failed to start MCP docs server", error)
		throw error
	}
}

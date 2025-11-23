import path from "node:path"
import { fileURLToPath } from "node:url"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { readPackageUpSync } from "read-package-up"

import { CONFIG_FILENAME, loadConfig } from "../config.js"
import { createLogger, logger } from "../logger.js"
import { createDocsTool } from "../tools/docs.js"

export interface RunServerOptions {
	configPath?: string
	docs?: string
}

export async function runServer(options: RunServerOptions = {}): Promise<void> {
	// Resolve configPath: process.cwd() + mcp-docs-server.json unless provided
	const configPath = options.configPath
		? path.isAbsolute(options.configPath)
			? options.configPath
			: path.resolve(process.cwd(), options.configPath)
		: path.join(process.cwd(), CONFIG_FILENAME)

	// Find templatePath from npm package using read-package-up
	const moduleDir = path.dirname(fileURLToPath(import.meta.url))
	const packageRootResult = readPackageUpSync({ cwd: moduleDir })
	if (!packageRootResult?.path) {
		throw new Error("package.json not found. This indicates a packaging error.")
	}
	const packageRoot = path.dirname(packageRootResult.path)
	const templatePath = path.join(packageRoot, "templates", "docs.mdx")

	const config = loadConfig({ configPath, templatePath, docs: options.docs })
	const server = await createServer(config)

	try {
		const transport = new StdioServerTransport()
		await server.connect(transport)
		await logger.info(`Started ${config.name}`)
	} catch (error) {
		await logger.error("Failed to start MCP docs server", error)
		throw error
	}
}

async function createServer(config: Awaited<ReturnType<typeof loadConfig>>): Promise<McpServer> {
	const docsTool = await createDocsTool(config)

	const server = new McpServer({
		name: config.name,
		version: config.version
	})

	server.registerTool(docsTool.name, docsTool.config, docsTool.cb)

	Object.assign(logger, createLogger(server))

	return server
}

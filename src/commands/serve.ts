import path from "node:path"
import { fileURLToPath } from "node:url"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { readPackageUpSync } from "read-package-up"
import { registerPrompts } from "../handlers/prompts.js"
import { registerResources } from "../handlers/resources.js"
import { registerTools } from "../handlers/tools.js"
import { CONFIG_FILENAME, loadConfig } from "../utils/config.js"
import { createLogger, logger } from "../utils/logger.js"

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
	// Note: Don't use console.info/log here - stdout is reserved for JSON-RPC in stdio mode
	// Use console.error for any debug output (writes to stderr)
	console.error(`[mcp-docs-server] Config: ${configPath}`)
	console.error(`[mcp-docs-server] Docs: ${config.docRoot.absolutePath}`)
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
	const server = new McpServer({
		name: config.name,
		version: config.version
	})

	// Register tools
	await registerTools(server, config)

	// Register prompts if prompts directory exists
	await registerPrompts(server, config)

	// Register resources if resources directory exists
	await registerResources(server, config)

	Object.assign(logger, createLogger(server))

	return server
}

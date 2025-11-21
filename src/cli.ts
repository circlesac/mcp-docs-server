#!/usr/bin/env node

import { buildCloudflare } from "./build/cloudflare.js"
import { runServer } from "./index.js"
import { logger } from "./logger.js"
import { publishDocs } from "./publish.js"
import { fromPackageRoot } from "./utils.js"

const PACKAGE_CONFIG_PATH = fromPackageRoot("mcp-docs-server.json")

async function printUsage(): Promise<void> {
	await logger.info(`Usage: npx @circlesac/mcp-docs-server [command]

Commands:
  serve      Start the MCP docs server from the current directory
  publish    Package the documentation (publishes to npm by default)
  cloudflare Build Cloudflare Worker for remote MCP server
  help       Show this message

Options:
  serve --config <path>      Path to mcp-docs-server.json (default: ./mcp-docs-server.json)
  serve --docs <path>        Path to docs directory (overrides config file)
  publish --output <dir>     Stage the npm package in <dir> instead of publishing
  cloudflare --output <dir>  Override output directory (default: .build/cloudflare/)`)
}

function parseServeArgs(args: string[]): { configPath?: string; docs?: string } {
	const options: { configPath?: string; docs?: string } = {}

	for (let i = 0; i < args.length; i += 1) {
		const token = args[i]
		if (token === "--config" || token === "-c") {
			const next = args[i + 1]
			if (!next) {
				throw new Error("--config option requires a file path")
			}
			i += 1
			options.configPath = next
		} else if (token === "--docs" || token === "-d") {
			const next = args[i + 1]
			if (!next) {
				throw new Error("--docs option requires a directory path")
			}
			i += 1
			options.docs = next
		} else {
			throw new Error(`Unknown option for serve: ${token}`)
		}
	}

	return options
}

function parsePublishArgs(args: string[]): { outputDir?: string } {
	const options: { outputDir?: string } = {}

	for (let i = 0; i < args.length; i += 1) {
		const token = args[i]
		if (token === "--output" || token === "-o") {
			const next = args[i + 1]
			if (!next) {
				throw new Error("--output option requires a directory path")
			}
			i += 1
			options.outputDir = next
		} else {
			throw new Error(`Unknown option for publish: ${token}`)
		}
	}

	return options
}

function parseCloudflareArgs(args: string[]): { outputDir?: string } {
	const options: { outputDir?: string } = {}

	for (let i = 0; i < args.length; i += 1) {
		const token = args[i]
		if (token === "--output" || token === "-o") {
			const next = args[i + 1]
			if (!next) {
				throw new Error("--output option requires a directory path")
			}
			i += 1
			options.outputDir = next
		} else {
			throw new Error(`Unknown option for cloudflare: ${token}`)
		}
	}

	return options
}

async function main() {
	const args = process.argv.slice(2)
	const command = args[0]?.toLowerCase()

	try {
		switch (command) {
			case undefined:
				await runServer({ configPath: PACKAGE_CONFIG_PATH })
				break
			case "serve": {
				const options = parseServeArgs(args.slice(1))
				await runServer(options)
				break
			}
			case "publish": {
				const options = parsePublishArgs(args.slice(1))
				await publishDocs({ outputDir: options.outputDir })
				break
			}
			case "cloudflare": {
				const options = parseCloudflareArgs(args.slice(1))
				await buildCloudflare({ outputDir: options.outputDir })
				break
			}
			case "help":
			case "--help":
			case "-h":
				await printUsage()
				break
			default:
				await logger.error(`Unknown command: ${args[0]}`)
				await printUsage()
				process.exitCode = 1
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		await logger.error(message, error)
		process.exitCode = 1
	}
}

void main()

import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

import { fromPackageRoot } from "./utils.js"

export const CONFIG_FILENAME = "mcp-docs-server.json"
export const DEFAULT_TOOL_NAME = "searchDocs"

const configSchema = z.object({
	name: z.string(),
	package: z.string(),
	version: z.string(),
	docs: z.string().optional()
})

export interface DocRoot {
	relativePath: string
	absolutePath: string
}

export interface DocsServerConfig {
	name: string
	title: string
	packageName: string
	version: string
	tool: string
	description: string
	docRoot: DocRoot
	configPath: string
	rootDir: string
	raw: z.infer<typeof configSchema>
}

let cachedConfig: DocsServerConfig | null = null
let cachedTemplate: string | null = null

async function loadTemplate(): Promise<string> {
	if (cachedTemplate) {
		return cachedTemplate
	}

	const templatePath = fromPackageRoot("templates", "docs.mdx")
	try {
		cachedTemplate = await fs.readFile(templatePath, "utf-8")
		return cachedTemplate
	} catch (_error) {
		const fallback = `Get {{NAME}} internal documentation.`
		cachedTemplate = fallback
		return fallback
	}
}

function normalizeDocDir(dir: string): string {
	const normalized = dir.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/").replace(/\/$/, "")

	if (normalized === ".") {
		throw new Error('Doc directory "." is not supported. Please specify a subdirectory.')
	}

	if (normalized.split("/").some((segment) => segment === "..")) {
		throw new Error(`Doc directory cannot include parent directory traversal: ${dir}`)
	}

	return normalized.length === 0 ? "docs" : normalized
}

async function ensureDirectoryExists(absolutePath: string): Promise<void> {
	try {
		const stats = await fs.stat(absolutePath)
		if (!stats.isDirectory()) {
			throw new Error(`Expected directory at ${absolutePath}`)
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
			throw new Error(`Documentation directory not found: ${absolutePath}`)
		}
		throw error
	}
}

export async function loadConfig(options: { configPath?: string; cwd?: string; docs?: string } = {}): Promise<DocsServerConfig> {
	if (cachedConfig) {
		return cachedConfig
	}

	const baseDir = options.cwd ? path.resolve(options.cwd) : process.cwd()
	const configPath = options.configPath ? path.resolve(options.configPath) : path.resolve(baseDir, CONFIG_FILENAME)

	let fileContents: string
	try {
		fileContents = await fs.readFile(configPath, "utf-8")
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
			throw new Error(`Configuration file not found: ${configPath}`)
		}
		throw new Error(`Failed to read ${configPath}: ${error instanceof Error ? error.message : String(error)}`)
	}

	let parsedJson: unknown
	try {
		parsedJson = JSON.parse(fileContents)
	} catch (error) {
		throw new Error(`Invalid JSON in ${configPath}: ${error instanceof Error ? error.message : String(error)}`)
	}

	const rawConfig = configSchema.parse(parsedJson)
	const rootDir = path.dirname(configPath)

	// Use --docs option if provided, otherwise use config file value or default
	let docRoot: DocRoot
	if (options.docs) {
		if (path.isAbsolute(options.docs)) {
			// Absolute path: use as-is
			docRoot = {
				relativePath: path.basename(options.docs),
				absolutePath: path.resolve(options.docs)
			}
		} else {
			// Relative path: normalize and resolve from config directory
			const docsDir = normalizeDocDir(options.docs)
			docRoot = {
				relativePath: docsDir,
				absolutePath: path.resolve(rootDir, docsDir)
			}
		}
	} else {
		// Use config file value or default
		const docsDir = normalizeDocDir(rawConfig.docs ?? "docs")
		docRoot = {
			relativePath: docsDir,
			absolutePath: path.resolve(rootDir, docsDir)
		}
	}

	await ensureDirectoryExists(docRoot.absolutePath)

	const name = rawConfig.name.trim().length === 0 ? "Acme" : rawConfig.name.trim()
	const title = `${name} Documentation Server`
	const template = await loadTemplate()
	const description = template.replace(/{{NAME}}/g, name)
	const config: DocsServerConfig = {
		name,
		title,
		packageName: rawConfig.package,
		version: rawConfig.version,
		tool: DEFAULT_TOOL_NAME,
		description,
		docRoot,
		configPath,
		rootDir,
		raw: rawConfig
	}

	cachedConfig = config
	return config
}

export function getConfig(): DocsServerConfig {
	if (!cachedConfig) {
		throw new Error("Config not loaded. Call loadConfig() first.")
	}
	return cachedConfig
}

export function clearConfigCache(): void {
	cachedConfig = null
}

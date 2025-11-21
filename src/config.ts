import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

import { fromPackageRoot, getPackageRoot } from "./utils.js"

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
	useReaddirMap: boolean
	raw: z.infer<typeof configSchema>
}

let cachedConfig: DocsServerConfig | null = null
let cachedTemplate: string | null = null

function createToolName(rawName: string, rawPackage: string): string {
	const candidates = [rawName, rawPackage]

	for (const candidate of candidates) {
		const cleaned = candidate
			.trim()
			.replace(/[^a-zA-Z0-9]+/g, " ")
			.split(" ")
			.filter(Boolean)
			.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
			.join("")

		if (cleaned.length > 0) {
			return `search${cleaned}`
		}
	}

	return DEFAULT_TOOL_NAME
}

async function loadTemplate(isVFS = false): Promise<string> {
	if (cachedTemplate) {
		return cachedTemplate
	}

	const templatePath = isVFS ? "/bundle/templates/docs.mdx" : fromPackageRoot(getPackageRoot(), "templates", "docs.mdx")
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

	// Determine config path - if configPath is provided with /bundle/ prefix, use VFS
	// Otherwise, use file system paths
	const isVFS = options.configPath?.startsWith("/bundle/")

	let configPath: string
	let rootDir: string

	if (isVFS) {
		// VFS path (Cloudflare Workers)
		configPath = options.configPath || `/bundle/${CONFIG_FILENAME}`
		rootDir = "/bundle"
	} else {
		// File system path (Node.js)
		const baseDir = options.cwd ? path.resolve(options.cwd) : process.cwd()
		configPath = options.configPath ? path.resolve(options.configPath) : path.resolve(baseDir, CONFIG_FILENAME)
		rootDir = path.dirname(configPath)
	}

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

	// Use --docs option if provided, otherwise use config file value or default
	let docRoot: DocRoot
	if (options.docs) {
		if (isVFS || options.docs.startsWith("/bundle/")) {
			// VFS path: use as-is
			const docsDir = normalizeDocDir(options.docs.replace(/^\/bundle\//, ""))
			docRoot = {
				relativePath: docsDir,
				absolutePath: `/bundle/${docsDir}`
			}
		} else if (path.isAbsolute(options.docs)) {
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
				absolutePath: isVFS ? `/bundle/${docsDir}` : path.resolve(rootDir, docsDir)
			}
		}
	} else {
		// Use config file value or default
		const docsDir = normalizeDocDir(rawConfig.docs ?? "docs")
		docRoot = {
			relativePath: docsDir,
			absolutePath: isVFS ? `/bundle/${docsDir}` : path.resolve(rootDir, docsDir)
		}
	}

	// Skip directory check in VFS (it's read-only and always exists if bundled)
	if (!isVFS) {
		await ensureDirectoryExists(docRoot.absolutePath)
	}

	const name = rawConfig.name.trim().length === 0 ? "Acme" : rawConfig.name.trim()
	const toolName = createToolName(rawConfig.name, rawConfig.package)
	const title = `${name} Documentation Server`
	const template = await loadTemplate(isVFS)
	const description = template.replace(/{{NAME}}/g, name).replace(/{{TOOL_NAME}}/g, toolName)
	const config: DocsServerConfig = {
		name,
		title,
		packageName: rawConfig.package,
		version: rawConfig.version,
		tool: toolName,
		description,
		docRoot,
		configPath,
		rootDir,
		useReaddirMap: isVFS ?? false,
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

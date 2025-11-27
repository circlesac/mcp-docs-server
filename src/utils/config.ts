import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { readPackageUpSync } from "read-package-up"
import { z } from "zod"

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

function ensureDirectoryExists(absolutePath: string): void {
	const stats = fs.statSync(absolutePath)
	if (!stats.isDirectory()) {
		throw new Error(`Expected directory at ${absolutePath}`)
	}
}

export function loadConfig(options: { configPath: string; templatePath: string; docs?: string }): DocsServerConfig {
	// configPath and templatePath are required
	const configPath = options.configPath
	const rootDir = path.dirname(configPath)

	const fileContents = fs.readFileSync(configPath, "utf-8")
	const parsedJson: unknown = JSON.parse(fileContents)

	const rawConfig = configSchema.parse(parsedJson)

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

	ensureDirectoryExists(docRoot.absolutePath)

	const name = rawConfig.name.trim().length === 0 ? "Acme" : rawConfig.name.trim()
	const toolName = createToolName(rawConfig.name, rawConfig.package)
	const title = `${name} Documentation Server`

	// templatePath is required
	const template = fs.readFileSync(options.templatePath, "utf-8")
	const description = template.replace(/{{NAME}}/g, name).replace(/{{TOOL_NAME}}/g, toolName)

	return {
		name,
		title,
		packageName: rawConfig.package,
		version: rawConfig.version,
		tool: toolName,
		description,
		docRoot,
		configPath,
		rootDir,
		raw: rawConfig
	}
}

/**
 * Get the bundled config path from the npm package
 */
export function getBundledConfigPath(): string {
	const moduleDir = path.dirname(fileURLToPath(import.meta.url))
	const packageRootResult = readPackageUpSync({ cwd: moduleDir })
	if (!packageRootResult?.path) {
		throw new Error("package.json not found. This indicates a packaging error.")
	}
	const packageRoot = path.dirname(packageRootResult.path)
	return path.join(packageRoot, CONFIG_FILENAME)
}

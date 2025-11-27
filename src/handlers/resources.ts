import fs from "node:fs/promises"
import path from "node:path"
import type { ListResourcesCallback, McpServer, ReadResourceTemplateCallback } from "@modelcontextprotocol/sdk/server/mcp.js"
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js"
import { UriTemplate } from "@modelcontextprotocol/sdk/shared/uriTemplate.js"
import type { Resource } from "@modelcontextprotocol/sdk/types.js"
import mimeTypes from "mime-types"

import type { DocsServerConfig } from "../utils/config.js"
import { logger } from "../utils/logger.js"

const RESOURCES_DIR = "resources"
const TEMPLATES_FILE = "templates.json"

interface ResourceTemplateConfig {
	uriTemplate: string
	name: string
	description?: string
	mimeType?: string
}

interface DiscoveredFile {
	filePath: string
	relativePath: string
	schema: string
	host: string
	pathSegments: string[]
}

interface MatchedResource {
	file: DiscoveredFile
	template: ResourceTemplateConfig
	uri: string
	variables: Record<string, string | string[]>
}

/**
 * Check if resources directory exists
 */
export async function resourcesDirectoryExists(rootDir: string): Promise<boolean> {
	const resourcesPath = path.join(rootDir, RESOURCES_DIR)
	try {
		const stats = await fs.stat(resourcesPath)
		return stats.isDirectory()
	} catch {
		return false
	}
}

/**
 * Get MIME type for a file
 */
function getMimeType(filePath: string, templateMimeType?: string, isBinary?: boolean): string {
	if (templateMimeType) {
		return templateMimeType
	}

	const mimeType = mimeTypes.lookup(filePath)
	if (mimeType) {
		return mimeType
	}

	// Fallback: use application/octet-stream for binary files, text/plain for text files
	if (isBinary) {
		return "application/octet-stream"
	}
	return "text/plain"
}

/**
 * Check if a file is likely binary
 */
async function isBinaryFile(filePath: string): Promise<boolean> {
	try {
		const buffer = await fs.readFile(filePath)
		// Check for null bytes (common in binary files)
		return buffer.includes(0)
	} catch {
		return false
	}
}

/**
 * Calculate template specificity score (higher = more specific)
 */
function calculateSpecificity(template: string): number {
	let score = 0
	const templateObj = new UriTemplate(template)

	// Count fixed segments (non-variable parts)
	const parts = template.split("/")
	for (const part of parts) {
		if (!part.includes("{") && !part.includes("}")) {
			score += 10 // Fixed segments are more specific
		} else if (part.includes("{...")) {
			score -= 5 // Variable paths are less specific
		} else {
			score += 1 // Regular variables
		}
	}

	// Fewer variables = more specific
	const variableCount = templateObj.variableNames.length
	score -= variableCount

	return score
}

/**
 * Parse filesystem path into schema, host, and path segments
 */
function parseResourcePath(filePath: string, resourcesDir: string): DiscoveredFile | null {
	const relativePath = path.relative(resourcesDir, filePath)
	const parts = relativePath.split(path.sep).filter(Boolean)

	// Need at least schema and host (2 parts minimum)
	if (parts.length < 2) {
		return null
	}

	const schema = parts[0]
	const host = parts[1]
	const pathSegments = parts.slice(2)

	return {
		filePath,
		relativePath,
		schema,
		host,
		pathSegments
	}
}

/**
 * Convert filesystem path to URI
 */
function filesystemPathToUri(file: DiscoveredFile): string {
	if (file.pathSegments.length > 0) {
		return `${file.schema}://${file.host}/${file.pathSegments.join("/")}`
	}
	return `${file.schema}://${file.host}`
}

/**
 * Match a file against a template and extract variables
 */
function matchFileToTemplate(file: DiscoveredFile, template: ResourceTemplateConfig): MatchedResource | null {
	const uri = filesystemPathToUri(file)
	const uriTemplate = new UriTemplate(template.uriTemplate)
	const variables = uriTemplate.match(uri)

	if (!variables) {
		return null
	}

	return {
		file,
		template,
		uri,
		variables
	}
}

/**
 * Recursively discover all files in resources directory
 */
async function discoverFiles(resourcesDir: string): Promise<DiscoveredFile[]> {
	const files: DiscoveredFile[] = []

	async function scanDir(dirPath: string): Promise<void> {
		try {
			const entries = await fs.readdir(dirPath, { withFileTypes: true })

			for (const entry of entries) {
				const entryPath = path.join(dirPath, entry.name)

				if (entry.isDirectory()) {
					await scanDir(entryPath)
				} else if (entry.isFile()) {
					const file = parseResourcePath(entryPath, resourcesDir)
					if (file) {
						files.push(file)
					}
				}
			}
		} catch (error) {
			await logger.warning(`Failed to scan directory: ${dirPath}`, error)
		}
	}

	await scanDir(resourcesDir)
	return files
}

/**
 * Load templates.json file
 */
async function loadTemplates(resourcesDir: string): Promise<ResourceTemplateConfig[]> {
	const templatesPath = path.join(resourcesDir, TEMPLATES_FILE)

	try {
		const content = await fs.readFile(templatesPath, "utf-8")
		const templates = JSON.parse(content) as ResourceTemplateConfig[]

		if (!Array.isArray(templates)) {
			throw new Error("templates.json must contain an array of template objects")
		}

		// Validate templates
		for (const template of templates) {
			if (!template.uriTemplate || !template.name) {
				throw new Error("Each template must have uriTemplate and name")
			}
		}

		// Sort by specificity (most specific first)
		return templates.sort((a, b) => calculateSpecificity(b.uriTemplate) - calculateSpecificity(a.uriTemplate))
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return []
		}
		throw error
	}
}

/**
 * Match files to templates using specificity rules
 */
function matchFilesToTemplates(files: DiscoveredFile[], templates: ResourceTemplateConfig[]): MatchedResource[] {
	const matched: MatchedResource[] = []
	const unmatchedFiles = new Set(files)

	// Try each template in order (already sorted by specificity)
	for (const template of templates) {
		const templateMatches: MatchedResource[] = []

		for (const file of unmatchedFiles) {
			const match = matchFileToTemplate(file, template)
			if (match) {
				templateMatches.push(match)
			}
		}

		// Add matches and remove from unmatched set
		for (const match of templateMatches) {
			matched.push(match)
			unmatchedFiles.delete(match.file)
		}
	}

	return matched
}

/**
 * Register all resources from the resources directory with the MCP server
 */
export async function registerResources(server: McpServer, config: DocsServerConfig): Promise<void> {
	const resourcesDir = path.join(config.rootDir, RESOURCES_DIR)

	if (!(await resourcesDirectoryExists(config.rootDir))) {
		return
	}

	// Load templates
	const templates = await loadTemplates(resourcesDir)

	// Discover all files
	const files = await discoverFiles(resourcesDir)

	if (files.length === 0) {
		return
	}

	// Match files to templates
	const matchedResources = matchFilesToTemplates(files, templates)

	// Group matched resources by template
	const resourcesByTemplate = new Map<ResourceTemplateConfig, MatchedResource[]>()
	for (const resource of matchedResources) {
		if (!resourcesByTemplate.has(resource.template)) {
			resourcesByTemplate.set(resource.template, [])
		}
		resourcesByTemplate.get(resource.template)!.push(resource)
	}

	// Register each template as a ResourceTemplate
	for (const [template, resources] of resourcesByTemplate.entries()) {
		const listCallback: ListResourcesCallback = async () => {
			const resourceList: Resource[] = await Promise.all(
				resources.map(async (r) => {
					const isBinary = await isBinaryFile(r.file.filePath)
					return {
						uri: r.uri,
						name: path.basename(r.file.filePath),
						mimeType: getMimeType(r.file.filePath, template.mimeType, isBinary),
						description: template.description
					}
				})
			)

			return {
				resources: resourceList
			}
		}

		const readCallback: ReadResourceTemplateCallback = async (uri, _variables) => {
			// Find the matching resource
			const resource = resources.find((r) => r.uri === uri.href)
			if (!resource) {
				throw new Error(`Resource not found: ${uri.href}`)
			}

			try {
				const isBinary = await isBinaryFile(resource.file.filePath)
				const mimeType = getMimeType(resource.file.filePath, template.mimeType, isBinary)

				if (isBinary || mimeType.startsWith("image/") || mimeType === "application/octet-stream") {
					// Read as binary
					const buffer = await fs.readFile(resource.file.filePath)
					return {
						contents: [
							{
								uri: uri.href,
								mimeType,
								blob: buffer.toString("base64")
							}
						]
					}
				} else {
					// Read as text
					const content = await fs.readFile(resource.file.filePath, "utf-8")
					return {
						contents: [
							{
								uri: uri.href,
								mimeType,
								text: content
							}
						]
					}
				}
			} catch (error) {
				await logger.error(`Failed to read resource: ${uri.href}`, error)
				throw new Error(`Failed to read resource: ${uri.href}`)
			}
		}

		// Register the resource template
		server.registerResource(
			template.name,
			new ResourceTemplate(template.uriTemplate, { list: listCallback }),
			{
				title: template.name,
				description: template.description,
				mimeType: template.mimeType
			},
			readCallback
		)
	}

	// Note: Files that don't match any template are not exposed.
	// Users must define templates.json to expose resources.
	// This ensures explicit control over resource URIs and prevents accidental exposure.
}

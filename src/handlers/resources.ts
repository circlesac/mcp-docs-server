import fs from "node:fs/promises"
import path from "node:path"
import type { ListResourcesCallback, McpServer, ReadResourceTemplateCallback } from "@modelcontextprotocol/sdk/server/mcp.js"
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js"
import { UriTemplate } from "@modelcontextprotocol/sdk/shared/uriTemplate.js"
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

export async function resourcesDirectoryExists(rootDir: string): Promise<boolean> {
	try {
		return (await fs.stat(path.join(rootDir, RESOURCES_DIR))).isDirectory()
	} catch {
		return false
	}
}

function getMimeType(filePath: string, templateMimeType?: string, isBinary?: boolean): string {
	if (templateMimeType) return templateMimeType
	const mimeType = mimeTypes.lookup(filePath)
	if (mimeType) return mimeType
	return isBinary === undefined ? "text/plain" : isBinary ? "application/octet-stream" : "text/plain"
}

async function isBinaryFile(filePath: string): Promise<boolean> {
	try {
		return (await fs.readFile(filePath)).includes(0)
	} catch {
		return false
	}
}

function calculateSpecificity(template: string): number {
	let score = 0
	const templateObj = new UriTemplate(template)
	for (const part of template.split("/")) {
		if (!part.includes("{") && !part.includes("}")) score += 10
		else if (part.includes("{...")) score -= 5
		else score += 1
	}
	return score - templateObj.variableNames.length
}

function parseResourcePath(filePath: string, resourcesDir: string): DiscoveredFile | null {
	const parts = path.relative(resourcesDir, filePath).split(path.sep).filter(Boolean)
	if (parts.length < 2) return null
	return {
		filePath,
		relativePath: path.relative(resourcesDir, filePath),
		schema: parts[0],
		host: parts[1],
		pathSegments: parts.slice(2)
	}
}

function filesystemPathToUri(file: DiscoveredFile): string {
	const path = file.pathSegments.length > 0 ? `/${file.pathSegments.join("/")}` : ""
	return `${file.schema}://${file.host}${path}`
}

function matchFileToTemplate(file: DiscoveredFile, template: ResourceTemplateConfig): MatchedResource | null {
	const uri = filesystemPathToUri(file)
	const variables = new UriTemplate(template.uriTemplate).match(uri)
	if (!variables) return null
	return { file, template, uri, variables }
}

async function discoverFiles(resourcesDir: string): Promise<DiscoveredFile[]> {
	const files: DiscoveredFile[] = []
	async function scanDir(dirPath: string): Promise<void> {
		try {
			for (const entry of await fs.readdir(dirPath, { withFileTypes: true })) {
				const entryPath = path.join(dirPath, entry.name)
				if (entry.isDirectory()) await scanDir(entryPath)
				else if (entry.isFile()) {
					const file = parseResourcePath(entryPath, resourcesDir)
					if (file) files.push(file)
				}
			}
		} catch (error) {
			await logger.warning(`Failed to scan directory: ${dirPath}`, error)
		}
	}
	await scanDir(resourcesDir)
	return files
}

async function loadTemplates(resourcesDir: string): Promise<ResourceTemplateConfig[]> {
	try {
		const templates = JSON.parse(await fs.readFile(path.join(resourcesDir, TEMPLATES_FILE), "utf-8")) as ResourceTemplateConfig[]
		if (!Array.isArray(templates)) throw new Error("templates.json must contain an array of template objects")
		for (const template of templates) {
			if (!template.uriTemplate || !template.name) throw new Error("Each template must have uriTemplate and name")
		}
		return templates.sort((a, b) => calculateSpecificity(b.uriTemplate) - calculateSpecificity(a.uriTemplate))
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
		throw error
	}
}

function matchFilesToTemplates(files: DiscoveredFile[], templates: ResourceTemplateConfig[]): MatchedResource[] {
	const matched: MatchedResource[] = []
	const unmatchedFiles = new Set(files)
	for (const template of templates) {
		const templateMatches: MatchedResource[] = []
		for (const file of unmatchedFiles) {
			const match = matchFileToTemplate(file, template)
			if (match) templateMatches.push(match)
		}
		for (const match of templateMatches) {
			matched.push(match)
			unmatchedFiles.delete(match.file)
		}
	}
	return matched
}

export async function registerResources(server: McpServer, config: DocsServerConfig): Promise<void> {
	const resourcesDir = path.join(config.rootDir, RESOURCES_DIR)
	if (!(await resourcesDirectoryExists(config.rootDir))) return
	const templates = await loadTemplates(resourcesDir)
	const files = await discoverFiles(resourcesDir)
	if (files.length === 0) return

	const matchedResources = matchFilesToTemplates(files, templates)
	const resourcesByTemplate = new Map<ResourceTemplateConfig, MatchedResource[]>()
	for (const resource of matchedResources) {
		if (!resourcesByTemplate.has(resource.template)) resourcesByTemplate.set(resource.template, [])
		resourcesByTemplate.get(resource.template)!.push(resource)
	}
	for (const [template, resources] of resourcesByTemplate.entries()) {
		const listCallback: ListResourcesCallback = async () => ({
			resources: resources.map((r) => ({
				uri: r.uri,
				name: path.basename(r.file.filePath),
				mimeType: getMimeType(r.file.filePath, template.mimeType),
				description: template.description
			}))
		})
		const readCallback: ReadResourceTemplateCallback = async (uri, _variables) => {
			const resource = resources.find((r) => r.uri === uri.href)
			if (!resource) throw new Error(`Resource not found: ${uri.href}`)
			try {
				const isBinary = await isBinaryFile(resource.file.filePath)
				const mimeType = getMimeType(resource.file.filePath, template.mimeType, isBinary)
				if (isBinary || mimeType.startsWith("image/") || mimeType === "application/octet-stream") {
					return {
						contents: [{ uri: uri.href, mimeType, blob: (await fs.readFile(resource.file.filePath)).toString("base64") }]
					}
				}
				return {
					contents: [{ uri: uri.href, mimeType, text: await fs.readFile(resource.file.filePath, "utf-8") }]
				}
			} catch (error) {
				await logger.error(`Failed to read resource: ${uri.href}`, error)
				throw new Error(`Failed to read resource: ${uri.href}`)
			}
		}
		server.registerResource(
			template.name,
			new ResourceTemplate(template.uriTemplate, { list: listCallback }),
			{ title: template.name, description: template.description, mimeType: template.mimeType },
			readCallback
		)
	}
}

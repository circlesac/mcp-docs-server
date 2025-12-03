import fs from "node:fs/promises"
import path from "node:path"
import type { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { stringify } from "yaml"
import { z } from "zod"

import type { DocRoot, DocsServerConfig } from "../utils/config.js"
import { getMatchingPaths, normalizeDocPath } from "../utils/index.js"
import { logger } from "../utils/logger.js"

type FileContent = {
	type: "file"
	path: string
	content: string
}

type DirectoryContent = {
	type: "directory"
	path: string
	subdirectories: string[]
	files: string[]
	suggestions?: string
}

type ErrorContent = {
	type: "error"
	path: string
	error: string
	suggestions?: string
}

type DocResult = FileContent | DirectoryContent | ErrorContent

type ReadMdResult = { found: true; result: FileContent | DirectoryContent; isSecurityViolation: boolean } | { found: false; isSecurityViolation: boolean }

interface ResolvedDocPath {
	absolutePath: string
	relativePath: string
}

interface TopLevelEntries {
	directories: string[]
	referenceSubdirectories: string[]
	files: string[]
}

export async function createDocsTool(config: DocsServerConfig) {
	const pathsDescription = await buildPathsDescription(config.docRoot, config)
	const docsParameters = z.object({
		paths: z.array(z.string()).min(1).describe(pathsDescription),
		queryKeywords: z
			.array(z.string())
			.optional()
			.describe(
				"Keywords from user query to use for matching documentation. Each keyword should be a single word or short phrase; whitespace-separated keywords will be split automatically."
			)
	})
	const toolName = config.tool

	// Define callback with ToolCallback type using type assertion to bridge Zod's types with MCP SDK's types
	const callback: ToolCallback<typeof docsParameters> = async (args, _extra) => {
		void logger.debug(`Executing ${toolName} tool`, { args })
		const queryKeywords = args.queryKeywords ?? []
		const docRoot = config.docRoot.absolutePath
		const availablePaths = await buildAvailablePaths(config)

		const results: DocResult[] = await Promise.all(
			args.paths.map(async (docPath: string): Promise<DocResult> => {
				try {
					const result = await readMdContent(docPath, queryKeywords, config)
					if (result.found) {
						return result.result
					}
					if (result.isSecurityViolation) {
						return {
							type: "error",
							path: docPath,
							error: "Invalid path"
						}
					}
					const suggestions = await getMatchingPaths(docPath, queryKeywords, [docRoot])
					const errorMessage = `Path "${docPath}" not found.`
					return {
						type: "error",
						path: docPath,
						error: errorMessage,
						suggestions: suggestions || undefined
					}
				} catch (error) {
					await logger.warning(`Failed to read content for path: ${docPath}`, error)
					return {
						type: "error",
						path: docPath,
						error: error instanceof Error ? error.message : "Unknown error"
					}
				}
			})
		)

		// Return each result as a separate content item with frontmatter
		const contentItems = results.map((result) => {
			const frontmatter: Record<string, unknown> = {
				path: result.path
			}

			if (result.type === "error") {
				frontmatter.error = result.error
				// availablePaths and suggestions are in the body, not frontmatter
				const frontmatterStr = formatFrontmatter(frontmatter)

				// Build error body with error message, available paths, and suggestions
				const errorBodyLines: string[] = []
				errorBodyLines.push(result.error)

				// Only include availablePaths and suggestions for non-security violations
				// Security violations (Invalid path) should not expose available paths
				if (result.error !== "Invalid path") {
					if (availablePaths) {
						errorBodyLines.push("")
						errorBodyLines.push(availablePaths)
					}

					if (result.suggestions) {
						errorBodyLines.push("")
						errorBodyLines.push(result.suggestions)
					}
				}

				return {
					type: "text" as const,
					text: `${frontmatterStr}\n\n${errorBodyLines.join("\n")}`
				}
			}

			if (result.type === "file") {
				const frontmatterStr = formatFrontmatter(frontmatter)
				return {
					type: "text" as const,
					text: `${frontmatterStr}\n\n${result.content}`
				}
			}

			// Directory
			if (result.suggestions) {
				frontmatter.suggestions = result.suggestions
			}
			const frontmatterStr = formatFrontmatter(frontmatter)

			const directoryBody = formatDirectoryContent(result)
			return {
				type: "text" as const,
				text: `${frontmatterStr}\n\n${directoryBody}`
			}
		})

		return {
			content: contentItems
		} satisfies CallToolResult
	}

	// Output format: Returns an array of text content items, each with YAML frontmatter followed by body.
	// Frontmatter includes: path (required), error (for errors), suggestions (for directories).
	// Body contains file content, directory listing, or error details with availablePaths and suggestions.
	const toolDescription = `${config.description}\n\nOutput format: Returns an array of text content items, each with YAML frontmatter followed by body. Frontmatter includes: path (required), error (for errors), suggestions (for directories). Body contains file content, directory listing, or error details with availablePaths and suggestions.`

	return {
		name: toolName,
		config: {
			description: toolDescription,
			inputSchema: docsParameters
		},
		// The callback is properly typed as ToolCallback<typeof docsParameters>
		// Type assertion bridges Zod's types with MCP SDK's expected callback type
		cb: callback
	}
}

async function buildPathsDescription(docRoot: DocRoot, config: DocsServerConfig): Promise<string> {
	const { directories, referenceSubdirectories, files } = await collectTopLevelEntries(docRoot, config)
	const lines: string[] = ["One or more documentation paths to fetch", "Available paths:", "Available top-level paths:"]

	if (directories.length > 0) {
		lines.push("Directories:", ...directories.map((dir) => `- ${dir}`))
	} else {
		lines.push("Directories:", "- (none)")
	}

	if (referenceSubdirectories.length > 0) {
		lines.push("Reference subdirectories:", ...referenceSubdirectories.map((ref) => `- ${ref}`))
	}

	if (files.length > 0) {
		lines.push("Files:", ...files.map((file) => `- ${file}`))
	} else {
		lines.push("Files:", "- (none)")
	}

	return lines.join("\n")
}

async function buildAvailablePaths(config: DocsServerConfig): Promise<string> {
	const { directories, referenceSubdirectories, files } = await collectTopLevelEntries(config.docRoot, config)
	const rootLabel = config.docRoot.relativePath === "." ? "documentation root" : config.docRoot.relativePath
	const lines: string[] = [`Available top-level paths under "${rootLabel}":`, ""]

	lines.push("Directories:")
	if (directories.length > 0) {
		lines.push(...directories.map((dir) => `- ${dir}`))
	} else {
		lines.push("- (none)")
	}

	if (referenceSubdirectories.length > 0) {
		lines.push("", "Reference subdirectories:", ...referenceSubdirectories.map((ref) => `- ${ref}`))
	}

	lines.push("", "Files:")
	if (files.length > 0) {
		lines.push(...files.map((file) => `- ${file}`))
	} else {
		lines.push("- (none)")
	}

	return lines.join("\n").trim()
}

async function readMdContent(docPath: string, queryKeywords: string[], config: DocsServerConfig): Promise<ReadMdResult> {
	const { isSecurityViolation, resolved, rootPrefix } = await resolveDocPath(docPath, config)

	if (isSecurityViolation) {
		await logger.error("Path traversal attempt detected", { docPath })
		return { found: false, isSecurityViolation: true }
	}

	if (!resolved) {
		return { found: false, isSecurityViolation: false }
	}

	try {
		const stats = await fs.stat(resolved.absolutePath)

		if (stats.isDirectory()) {
			const { dirs, files } = await listDirContents(rootPrefix, resolved, config)

			const suggestions = await getMatchingPaths(docPath, queryKeywords, [config.docRoot.absolutePath])

			const directoryResult: DirectoryContent = {
				type: "directory",
				path: docPath,
				subdirectories: dirs,
				files,
				suggestions: suggestions || undefined
			}

			return { found: true, result: directoryResult, isSecurityViolation: false }
		}

		const content = await fs.readFile(resolved.absolutePath, "utf-8")
		const fileResult: FileContent = {
			type: "file",
			path: docPath,
			content
		}
		return { found: true, result: fileResult, isSecurityViolation: false }
	} catch (error) {
		await logger.error("Failed to read documentation content", { docPath, error: error instanceof Error ? error.message : String(error) })
		throw error
	}
}

async function resolveDocPath(docPath: string, config: DocsServerConfig): Promise<{ isSecurityViolation: boolean; resolved: ResolvedDocPath | null; rootPrefix: string }> {
	const normalized = normalizeDocPath(docPath)

	if (hasTraversal(normalized)) {
		return { isSecurityViolation: true, resolved: null, rootPrefix: "" }
	}

	const root = config.docRoot
	const rootPrefix = root.relativePath === "." ? "" : root.relativePath
	const candidates = new Set<string>()
	candidates.add(normalized)

	if (rootPrefix && normalized.startsWith(`${rootPrefix}/`)) {
		candidates.add(normalized.slice(rootPrefix.length + 1))
	}
	if (rootPrefix && normalized === rootPrefix) {
		candidates.add(".")
	}
	if (normalized.length === 0) {
		candidates.add(".")
	}

	for (const candidate of candidates) {
		const relativePath = candidate === "." ? "." : normalizeDocPath(candidate)
		const target = relativePath === "." ? root.absolutePath : path.resolve(root.absolutePath, relativePath)

		if (!target.startsWith(root.absolutePath)) {
			continue
		}

		try {
			await fs.stat(target)
			return {
				isSecurityViolation: false,
				resolved: {
					absolutePath: target,
					relativePath
				},
				rootPrefix
			}
		} catch {
			// continue searching other candidates
		}
	}

	return { isSecurityViolation: false, resolved: null, rootPrefix }
}

async function listDirContents(rootPrefix: string, resolved: ResolvedDocPath, _config: DocsServerConfig): Promise<{ dirs: string[]; files: string[] }> {
	const dirEntries: string[] = []
	const fileEntries: string[] = []

	const entries = await fs.readdir(resolved.absolutePath, { withFileTypes: true })

	for (const entry of entries) {
		if (entry.isDirectory()) {
			dirEntries.push(buildDisplayPath(resolved.relativePath, entry.name, rootPrefix, true))
		} else if (entry.isFile() && entry.name.endsWith(".md")) {
			fileEntries.push(buildDisplayPath(resolved.relativePath, entry.name, rootPrefix, false))
		}
	}

	dirEntries.sort((a, b) => a.localeCompare(b))
	fileEntries.sort((a, b) => a.localeCompare(b))

	return {
		dirs: dirEntries,
		files: fileEntries
	}
}

async function collectTopLevelEntries(docRoot: DocRoot, _config: DocsServerConfig): Promise<TopLevelEntries> {
	const directoryNames: string[] = []
	const fileNames: string[] = []

	const entries = await fs.readdir(docRoot.absolutePath, { withFileTypes: true })

	for (const entry of entries) {
		if (entry.isDirectory()) {
			directoryNames.push(entry.name)
		} else if (entry.isFile() && isMarkdownFile(entry.name)) {
			fileNames.push(entry.name)
		}
	}

	directoryNames.sort((a, b) => a.localeCompare(b))
	fileNames.sort((a, b) => a.localeCompare(b))

	let referenceSubdirectories: string[] = []
	if (directoryNames.includes("reference")) {
		const referenceEntries = await fs.readdir(path.join(docRoot.absolutePath, "reference"), { withFileTypes: true })
		const refs = referenceEntries
			.filter((entry) => entry.isDirectory())
			.map((entry) => `reference/${entry.name}/`)
			.sort((a, b) => a.localeCompare(b))
		referenceSubdirectories = refs
	}

	const directories = directoryNames.map((name) => `${name}/`)
	const files = fileNames

	return {
		directories,
		referenceSubdirectories,
		files
	}
}

function buildDisplayPath(relativePath: string, entry: string, rootPrefix: string, isDirectory: boolean): string {
	const cleaned = relativePath === "." ? "" : normalizeDocPath(relativePath)
	const segments = []
	if (rootPrefix.length > 0) {
		segments.push(rootPrefix)
	}
	if (cleaned.length > 0) {
		segments.push(cleaned)
	}
	segments.push(entry)
	const composed = segments.filter(Boolean).join("/")
	return isDirectory ? `${composed}/` : composed
}

function hasTraversal(input: string): boolean {
	return input.split("/").some((segment) => segment === "..")
}

function isMarkdownFile(name: string): boolean {
	return /\.mdx?$/i.test(name)
}

function formatFrontmatter(data: Record<string, unknown>): string {
	// Filter out undefined and null values
	const cleaned: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(data)) {
		if (value !== undefined && value !== null) {
			cleaned[key] = value
		}
	}

	// Use yaml library to stringify
	const yamlContent = stringify(cleaned, {
		lineWidth: 0, // Don't wrap lines
		minContentWidth: 0
	})

	return `---\n${yamlContent}---`
}

function formatDirectoryContent(result: DirectoryContent): string {
	const lines: string[] = []

	lines.push(`# Directory: ${result.path}\n`)

	if (result.subdirectories.length > 0) {
		lines.push("## Subdirectories\n")
		result.subdirectories.forEach((dir) => {
			lines.push(`- ${dir}`)
		})
		lines.push("")
	}

	if (result.files.length > 0) {
		lines.push("## Files\n")
		result.files.forEach((file) => {
			lines.push(`- ${file}`)
		})
		lines.push("")
	}

	if (result.suggestions) {
		lines.push("---\n")
		lines.push(result.suggestions)
	}

	return lines.join("\n")
}

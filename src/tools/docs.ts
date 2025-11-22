import fs from "node:fs/promises"
import path from "node:path"
import type { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"

import type { DocRoot, DocsServerConfig } from "../config.js"
import { logger } from "../logger.js"
import { getMatchingPaths, normalizeDocPath } from "../utils.js"

// Infer ToolDefinition type from registerTool signature
type ToolDefinition = Parameters<McpServer["registerTool"]>[1]

type ReadMdResult = { found: true; content: string; isSecurityViolation: boolean } | { found: false; isSecurityViolation: boolean }

interface ResolvedDocPath {
	absolutePath: string
	relativePath: string
}

const pathsSchema = z.array(z.string()).min(1)
const docsParametersSchema = z.object({
	paths: pathsSchema,
	queryKeywords: z
		.array(z.string())
		.optional()
		.describe(
			"Keywords from user query to use for matching documentation. Each keyword should be a single word or short phrase; whitespace-separated keywords will be split automatically."
		)
})

interface TopLevelEntries {
	directories: string[]
	referenceSubdirectories: string[]
	files: string[]
}

export async function createDocsTool(config: DocsServerConfig) {
	const pathsDescription = await buildPathsDescription(config.docRoot, config)
	const docsParameters = docsParametersSchema.extend({
		paths: pathsSchema.describe(pathsDescription)
	})
	const toolName = config.tool

	// Return structure that matches SDK's registerTool signature
	const inputSchema = docsParameters.shape

	const callback: ToolCallback<typeof inputSchema> = async (args, _extra) => {
		void logger.debug(`Executing ${toolName} tool`, { args })
		const queryKeywords = args.queryKeywords ?? []
		const docRoot = config.docRoot.absolutePath
		const availablePaths = await buildAvailablePaths(config)

		const results = await Promise.all(
			args.paths.map(async (docPath) => {
				try {
					const result = await readMdContent(docPath, queryKeywords, config)
					if (result.found) {
						return { path: docPath, content: result.content, error: null }
					}
					if (result.isSecurityViolation) {
						return { path: docPath, content: null, error: "Invalid path" }
					}
					const suggestions = await getMatchingPaths(docPath, queryKeywords, [docRoot])
					const errorMessage = [`Path "${docPath}" not found.`, availablePaths, suggestions].filter(Boolean).join("\n\n")
					return { path: docPath, content: null, error: errorMessage }
				} catch (error) {
					await logger.warning(`Failed to read content for path: ${docPath}`, error)
					return {
						path: docPath,
						content: null,
						error: error instanceof Error ? error.message : "Unknown error"
					}
				}
			})
		)

		const output = results
			.map((result) => {
				if (result.error) {
					return `## ${result.path}\n\n${result.error}\n\n---\n`
				}
				return `## ${result.path}\n\n${result.content}\n\n---\n`
			})
			.join("\n")

		// Return CallToolResult format
		return {
			content: [
				{
					type: "text" as const,
					text: output
				}
			]
		} satisfies CallToolResult
	}

	return {
		name: toolName,
		config: {
			description: config.description,
			inputSchema
		} satisfies ToolDefinition,
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
			const { dirs, files, rawFiles } = await listDirContents(rootPrefix, resolved, config)
			const header = [
				`Directory contents of ${docPath}:`,
				"",
				dirs.length > 0 ? "Subdirectories:" : "No subdirectories.",
				...dirs.map((d) => `- ${d}`),
				"",
				files.length > 0 ? "Files in this directory:" : "No files in this directory.",
				...files.map((f) => `- ${f}`),
				"",
				"---",
				"",
				"Contents of all files in this directory:",
				""
			].join("\n")

			let fileContents = ""
			for (let index = 0; index < rawFiles.length; index += 1) {
				const fileName = rawFiles[index]
				const displayPath = files[index] ?? fileName
				const filePath = path.join(resolved.absolutePath, fileName)
				const content = await fs.readFile(filePath, "utf-8")
				fileContents += `\n\n# ${displayPath}\n\n${content}`
			}

			const suggestions = await getMatchingPaths(docPath, queryKeywords, [config.docRoot.absolutePath])
			const suggestionBlock = suggestions ? ["", "---", "", suggestions].join("\n") : ""

			return { found: true, content: header + fileContents + suggestionBlock, isSecurityViolation: false }
		}

		const content = await fs.readFile(resolved.absolutePath, "utf-8")
		return { found: true, content, isSecurityViolation: false }
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

async function listDirContents(rootPrefix: string, resolved: ResolvedDocPath, _config: DocsServerConfig): Promise<{ dirs: string[]; files: string[]; rawFiles: string[] }> {
	const dirEntries: string[] = []
	const fileEntries: Array<{ display: string; name: string }> = []

	const entries = await fs.readdir(resolved.absolutePath, { withFileTypes: true })

	for (const entry of entries) {
		if (entry.isDirectory()) {
			dirEntries.push(buildDisplayPath(resolved.relativePath, entry.name, rootPrefix, true))
		} else if (entry.isFile() && entry.name.endsWith(".md")) {
			fileEntries.push({
				display: buildDisplayPath(resolved.relativePath, entry.name, rootPrefix, false),
				name: entry.name
			})
		}
	}

	dirEntries.sort((a, b) => a.localeCompare(b))
	fileEntries.sort((a, b) => a.display.localeCompare(b.display))

	return {
		dirs: dirEntries,
		files: fileEntries.map((entry) => entry.display),
		rawFiles: fileEntries.map((entry) => entry.name)
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

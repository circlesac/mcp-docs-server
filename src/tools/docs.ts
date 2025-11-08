import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

import { DEFAULT_TOOL_NAME, getConfig } from "../config.js"
import { logger } from "../logger.js"
import { getMatchingPaths, normalizeDocPath } from "../utils.js"

type ReadMdResult = { found: true; content: string; isSecurityViolation: boolean } | { found: false; isSecurityViolation: boolean }

interface ResolvedDocPath {
	absolutePath: string
	relativePath: string
}

const docsParameters = z.object({
	paths: z.array(z.string()).min(1).describe("One or more documentation paths to fetch."),
	queryKeywords: z
		.array(z.string())
		.optional()
		.describe(
			"Keywords from user query to use for matching documentation. Each keyword should be a single word or short phrase; whitespace-separated keywords will be split automatically."
		)
})

type DocsInput = z.infer<typeof docsParameters>

function hasTraversal(input: string): boolean {
	return input.split("/").some((segment) => segment === "..")
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

async function listDirContents(rootPrefix: string, resolved: ResolvedDocPath): Promise<{ dirs: string[]; files: string[]; rawFiles: string[] }> {
	const entries = await fs.readdir(resolved.absolutePath, { withFileTypes: true })
	const dirEntries: string[] = []
	const fileEntries: Array<{ display: string; name: string }> = []

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

async function resolveDocPath(docPath: string): Promise<{ isSecurityViolation: boolean; resolved: ResolvedDocPath | null; rootPrefix: string }> {
	const config = getConfig()
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

async function readMdContent(docPath: string, queryKeywords: string[]): Promise<ReadMdResult> {
	const config = getConfig()
	const { isSecurityViolation, resolved, rootPrefix } = await resolveDocPath(docPath)

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
			const { dirs, files, rawFiles } = await listDirContents(rootPrefix, resolved)
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

async function buildAvailablePaths(): Promise<string> {
	const { docRoot } = getConfig()
	const sections: string[] = []
	const rootLabel = docRoot.relativePath === "." ? "root" : docRoot.relativePath
	const resolved: ResolvedDocPath = {
		absolutePath: docRoot.absolutePath,
		relativePath: "."
	}
	const { dirs, files } = await listDirContents(docRoot.relativePath === "." ? "" : docRoot.relativePath, resolved)
	sections.push(`Root "${rootLabel}":`)
	if (dirs.length > 0) {
		sections.push("Directories:", ...dirs.map((dir) => `- ${dir}`))
	} else {
		sections.push("No directories found.")
	}
	if (files.length > 0) {
		sections.push("Files:", ...files.map((file) => `- ${file}`))
	} else {
		sections.push("No Markdown files found.")
	}

	return sections.join("\n").trim()
}

export function createDocsTool() {
	const config = getConfig()

	return {
		name: DEFAULT_TOOL_NAME,
		description: config.description,
		parameters: docsParameters,
		execute: async (args: DocsInput) => {
			void logger.debug(`Executing ${DEFAULT_TOOL_NAME} tool`, { args })
			const queryKeywords = args.queryKeywords ?? []
			const docRoot = config.docRoot.absolutePath
			const availablePaths = await buildAvailablePaths()

			const results = await Promise.all(
				args.paths.map(async (docPath) => {
					try {
						const result = await readMdContent(docPath, queryKeywords)
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

			return output
		}
	}
}

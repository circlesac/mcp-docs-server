import fs from "node:fs/promises"
import path, { dirname } from "node:path"
import { fileURLToPath } from "node:url"

const mdFileCache = new Map<string, string[]>()

export function getPackageRoot(): string {
	if (typeof import.meta.url !== "undefined") {
		const __dirname = dirname(fileURLToPath(import.meta.url))
		// Go up from src/utils.ts to package root
		return dirname(__dirname)
	}
	return process.cwd()
}

export function fromPackageRoot(baseDir: string, ...segments: string[]): string {
	return path.resolve(baseDir, ...segments)
}

export function sanitizePackageDirName(packageName: string): string {
	const sanitized = packageName.replace(/[^a-zA-Z0-9.-]+/g, "-").replace(/^-+|-+$/g, "")
	return sanitized || "docs"
}

export async function* walkMdFiles(dir: string, readdirMap?: { [dirPath: string]: { directories: string[]; files: string[] } }): AsyncGenerator<string> {
	if (mdFileCache.has(dir)) {
		for (const file of mdFileCache.get(dir)!) {
			yield file
		}
		return
	}

	const filesInDir: string[] = []

	if (readdirMap) {
		// Use readdir map for VFS mode
		// Convert absolute path like "/bundle/docs" to relative key like "docs"
		let mapKey = dir.replace(/^\/bundle\//, "").replace(/^\/bundle$/, "")
		if (!mapKey) mapKey = "."
		const entries = readdirMap[mapKey]
		if (entries) {
			for (const fileName of entries.files) {
				if (fileName.endsWith(".md")) {
					const fullPath = path.join(dir, fileName)
					filesInDir.push(fullPath)
					yield fullPath
				}
			}
			for (const dirName of entries.directories) {
				const fullPath = path.join(dir, dirName)
				for await (const file of walkMdFiles(fullPath, readdirMap)) {
					filesInDir.push(file)
					yield file
				}
			}
		}
	} else {
		// Use fs.readdir for Node.js mode
		const entries = await fs.readdir(dir, { withFileTypes: true })

		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name)
			if (entry.isDirectory()) {
				for await (const file of walkMdFiles(fullPath, readdirMap)) {
					filesInDir.push(file)
					yield file
				}
			} else if (entry.isFile() && entry.name.endsWith(".md")) {
				filesInDir.push(fullPath)
				yield fullPath
			}
		}
	}

	mdFileCache.set(dir, filesInDir)
}

export function extractKeywordsFromPath(filePath: string): string[] {
	const filename =
		filePath
			.split("/")
			.pop()
			?.replace(/\.(mdx|md)$/i, "") ?? ""
	const keywords = new Set<string>()

	const splitParts = filename.split(/[-_]|(?=[A-Z])/)
	for (const keyword of splitParts) {
		if (keyword.length > 2) {
			keywords.add(keyword.toLowerCase())
		}
	}

	return Array.from(keywords)
}

export function normalizeKeywords(keywords: string[]): string[] {
	return Array.from(new Set(keywords.flatMap((k) => k.split(/\s+/).filter(Boolean)).map((k) => k.toLowerCase())))
}

interface FileScore {
	path: string
	keywordMatches: Set<string>
	totalMatches: number
	titleMatches: number
	pathRelevance: number
}

function calculatePathRelevance(filePath: string, keywords: string[]): number {
	let relevance = 0
	const pathLower = filePath.toLowerCase()

	if (pathLower.startsWith("reference/")) {
		relevance += 2
	}

	keywords.forEach((keyword) => {
		if (pathLower.includes(keyword.toLowerCase())) {
			relevance += 3
		}
	})

	const highValue = ["guides", "getting-started", "architecture"]
	if (highValue.some((segment) => pathLower.includes(segment))) {
		relevance += 1
	}

	return relevance
}

function calculateFinalScore(score: FileScore, totalKeywords: number): number {
	const allKeywordsBonus = score.keywordMatches.size === totalKeywords ? 10 : 0

	return score.totalMatches * 1 + score.titleMatches * 3 + score.pathRelevance * 2 + score.keywordMatches.size * 5 + allKeywordsBonus
}

export async function searchDocumentContent(
	keywords: string[],
	baseDir: string,
	readdirMap?: { [dirPath: string]: { directories: string[]; files: string[] } }
): Promise<string[]> {
	if (keywords.length === 0) {
		return []
	}

	const fileScores = new Map<string, FileScore>()

	for await (const filePath of walkMdFiles(baseDir, readdirMap)) {
		let content: string
		try {
			content = await fs.readFile(filePath, "utf-8")
		} catch {
			continue
		}

		const lines = content.split("\n")
		lines.forEach((lineText) => {
			const lowerLine = lineText.toLowerCase()
			for (const keyword of keywords) {
				if (!lowerLine.includes(keyword.toLowerCase())) {
					continue
				}

				const relativePath = path.relative(baseDir, filePath).replace(/\\/g, "/")
				if (!fileScores.has(relativePath)) {
					fileScores.set(relativePath, {
						path: relativePath,
						keywordMatches: new Set(),
						totalMatches: 0,
						titleMatches: 0,
						pathRelevance: calculatePathRelevance(relativePath, keywords)
					})
				}

				const score = fileScores.get(relativePath)!
				score.keywordMatches.add(keyword)
				score.totalMatches += 1

				if (lowerLine.includes("#") || lowerLine.includes("title")) {
					score.titleMatches += 1
				}
			}
		})
	}

	const validFiles = Array.from(fileScores.values())
		.sort((a, b) => calculateFinalScore(b, keywords.length) - calculateFinalScore(a, keywords.length))
		.slice(0, 10)

	return validFiles.map((score) => score.path)
}

export function normalizeDocPath(docPath: string): string {
	let normalized = docPath.replace(/\\/g, "/")

	while (normalized.startsWith("./")) {
		normalized = normalized.slice(2)
	}

	normalized = normalized.replace(/^\/+/u, "")
	normalized = normalized.replace(/\/+/gu, "/")

	if (normalized.endsWith("/")) {
		normalized = normalized.slice(0, -1)
	}

	return normalized
}

export async function getMatchingPaths(
	pathInput: string,
	queryKeywords: string[] | undefined,
	baseDirs: string[],
	readdirMap?: { [dirPath: string]: { directories: string[]; files: string[] } }
): Promise<string> {
	const pathKeywords = extractKeywordsFromPath(pathInput)
	const allKeywords = normalizeKeywords([...pathKeywords, ...(queryKeywords ?? [])])

	if (allKeywords.length === 0) {
		return ""
	}

	const suggestedPaths = new Set<string>()
	for (const base of baseDirs) {
		const result = await searchDocumentContent(allKeywords, base, readdirMap)
		for (const entry of result) {
			suggestedPaths.add(entry)
		}
	}

	if (suggestedPaths.size === 0) {
		return ""
	}

	const pathList = Array.from(suggestedPaths)
		.sort()
		.map((value) => `- ${value}`)
		.join("\n")

	return `Here are some paths that might be relevant based on your query:\n\n${pathList}`
}

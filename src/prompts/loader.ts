import fs from "node:fs/promises"
import path from "node:path"
import { logger } from "../logger.js"
import { argsToZodSchema, extractPlaceholders, parseFrontmatter, replacePlaceholders, validatePlaceholders } from "./parser.js"

const PROMPTS_DIR = "prompts"

export interface LoadedPrompt {
	name: string
	title: string
	description: string
	argsSchema: ReturnType<typeof argsToZodSchema>
	callback: (args: Record<string, unknown>) => { messages: Array<{ role: "user" | "assistant"; content: { type: "text"; text: string } }> }
}

/**
 * Check if prompts directory exists
 */
export async function promptsDirectoryExists(rootDir: string): Promise<boolean> {
	const promptsPath = path.join(rootDir, PROMPTS_DIR)
	try {
		const stats = await fs.stat(promptsPath)
		return stats.isDirectory()
	} catch {
		return false
	}
}

/**
 * Get the absolute path to the prompts directory
 */
export function getPromptsDirectory(rootDir: string): string {
	return path.join(rootDir, PROMPTS_DIR)
}

/**
 * Load all prompts from the prompts directory
 */
export async function loadPrompts(rootDir: string): Promise<LoadedPrompt[]> {
	const promptsDir = getPromptsDirectory(rootDir)

	if (!(await promptsDirectoryExists(rootDir))) {
		return []
	}

	const prompts: LoadedPrompt[] = []
	const entries = await fs.readdir(promptsDir, { withFileTypes: true })

	for (const entry of entries) {
		if (!entry.isFile()) {
			continue
		}

		const fileName = entry.name
		if (!fileName.endsWith(".md") && !fileName.endsWith(".mdx")) {
			continue
		}

		try {
			const prompt = await loadPromptFromFile(promptsDir, fileName)
			if (prompt) {
				prompts.push(prompt)
			}
		} catch (error) {
			await logger.warning(`Failed to load prompt from ${fileName}`, error)
		}
	}

	return prompts
}

/**
 * Load a single prompt from a file
 */
async function loadPromptFromFile(promptsDir: string, fileName: string): Promise<LoadedPrompt | null> {
	const filePath = path.join(promptsDir, fileName)
	const content = await fs.readFile(filePath, "utf-8")

	// Generate prompt name from filename
	const name = generatePromptName(fileName)

	// Parse frontmatter and body
	const { frontmatter, body } = parseFrontmatter(content)

	// Extract placeholders from body
	const placeholders = extractPlaceholders(body)

	// For .md files without frontmatter, treat as simple prompt with no args
	if (!frontmatter && fileName.endsWith(".md")) {
		return {
			name,
			title: name,
			description: `Prompt: ${name}`,
			argsSchema: argsToZodSchema(undefined),
			callback: () => ({
				messages: [
					{
						role: "user" as const,
						content: {
							type: "text" as const,
							text: body.trim()
						}
					}
				]
			})
		}
	}

	// For .mdx files or .md files with frontmatter, require frontmatter
	if (!frontmatter) {
		throw new Error(`MDX file ${fileName} must have frontmatter`)
	}

	// Validate placeholders match args
	validatePlaceholders(placeholders, frontmatter.args)

	// Convert args to Zod schema
	const argsSchema = argsToZodSchema(frontmatter.args)

	// Create callback that replaces placeholders
	const callback = (args: Record<string, unknown>) => {
		const resolvedContent = replacePlaceholders(body, args)
		return {
			messages: [
				{
					role: "user" as const,
					content: {
						type: "text" as const,
						text: resolvedContent.trim()
					}
				}
			]
		}
	}

	return {
		name,
		title: frontmatter.title ?? name,
		description: frontmatter.description ?? `Prompt: ${name}`,
		argsSchema,
		callback
	}
}

/**
 * Generate prompt name from filename
 * review-code.mdx -> review-code
 * team-greeting.md -> team-greeting
 */
function generatePromptName(fileName: string): string {
	return fileName.replace(/\.(mdx?)$/i, "")
}

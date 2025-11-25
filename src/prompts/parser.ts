import { parse } from "yaml"
import { z } from "zod"

export interface PromptFrontmatter {
	title?: string
	description?: string
	args?: Record<string, ArgDefinition>
}

export interface ArgDefinition {
	type: "string" | "number" | "boolean"
	required?: boolean
	optional?: boolean
	description?: string
}

export interface ParsedPrompt {
	name: string
	title: string
	description: string
	argsSchema: z.ZodObject<z.ZodRawShape>
	content: string
	placeholders: string[]
}

const PLACEHOLDER_REGEX = /\{\{(\w+)\}\}/g

/**
 * Parse frontmatter from MDX file content
 * Extracts YAML frontmatter delimited by ---
 */
export function parseFrontmatter(content: string): { frontmatter: PromptFrontmatter | null; body: string } {
	const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
	const match = content.match(frontmatterRegex)

	if (!match) {
		return { frontmatter: null, body: content }
	}

	const frontmatterYaml = match[1]
	const body = match[2]

	try {
		// Use proper YAML parser
		const parsed = parse(frontmatterYaml) as unknown
		const frontmatter = normalizeFrontmatter(parsed)
		return { frontmatter, body }
	} catch (error) {
		throw new Error(`Failed to parse frontmatter: ${error instanceof Error ? error.message : String(error)}`)
	}
}

/**
 * Normalize parsed YAML to our PromptFrontmatter interface
 */
function normalizeFrontmatter(parsed: unknown): PromptFrontmatter {
	if (typeof parsed !== "object" || parsed === null) {
		return {}
	}

	const obj = parsed as Record<string, unknown>
	const result: PromptFrontmatter = {}

	if (typeof obj.title === "string") {
		result.title = obj.title
	}

	if (typeof obj.description === "string") {
		result.description = obj.description
	}

	if (obj.args && typeof obj.args === "object" && obj.args !== null) {
		result.args = normalizeArgs(obj.args as Record<string, unknown>)
	}

	return result
}

/**
 * Normalize args object to ArgDefinition format
 */
function normalizeArgs(args: Record<string, unknown>): Record<string, ArgDefinition> {
	const normalized: Record<string, ArgDefinition> = {}

	for (const [key, value] of Object.entries(args)) {
		if (typeof value === "object" && value !== null) {
			const argObj = value as Record<string, unknown>
			const arg: ArgDefinition = { type: "string" }

			if (typeof argObj.type === "string") {
				const type = argObj.type.toLowerCase()
				if (type === "string" || type === "number" || type === "boolean") {
					arg.type = type as "string" | "number" | "boolean"
				}
			}

			if (typeof argObj.required === "boolean") {
				arg.required = argObj.required
			} else if (typeof argObj.required === "string") {
				arg.required = argObj.required.toLowerCase() === "true"
			}

			if (typeof argObj.optional === "boolean") {
				arg.optional = argObj.optional
			} else if (typeof argObj.optional === "string") {
				arg.optional = argObj.optional.toLowerCase() === "true"
			}

			if (typeof argObj.description === "string") {
				arg.description = argObj.description
			}

			normalized[key] = arg
		}
	}

	return normalized
}

/**
 * Extract all placeholders from template content
 */
export function extractPlaceholders(content: string): string[] {
	const placeholders = new Set<string>()
	let match: RegExpExecArray | null

	while ((match = PLACEHOLDER_REGEX.exec(content)) !== null) {
		const placeholder = match[1]
		// Validate placeholder name (alphanumeric + underscores only)
		if (/^[a-zA-Z0-9_]+$/.test(placeholder)) {
			placeholders.add(placeholder)
		}
	}

	return Array.from(placeholders)
}

/**
 * Convert frontmatter args to Zod schema
 */
export function argsToZodSchema(args: Record<string, ArgDefinition> | undefined): z.ZodObject<z.ZodRawShape> {
	if (!args || Object.keys(args).length === 0) {
		return z.object({})
	}

	const shape: z.ZodRawShape = {}

	for (const [key, arg] of Object.entries(args)) {
		let zodType: z.ZodTypeAny

		switch (arg.type) {
			case "string":
				zodType = z.string()
				break
			case "number":
				zodType = z.number()
				break
			case "boolean":
				zodType = z.boolean()
				break
			default:
				zodType = z.string()
		}

		if (arg.description) {
			zodType = zodType.describe(arg.description)
		}

		// If optional is true OR required is false, make it optional
		if (arg.optional === true || arg.required === false) {
			zodType = zodType.optional()
		}

		shape[key] = zodType
	}

	return z.object(shape)
}

/**
 * Validate that all placeholders have corresponding args
 */
export function validatePlaceholders(placeholders: string[], args: Record<string, ArgDefinition> | undefined): void {
	if (!args) {
		if (placeholders.length > 0) {
			throw new Error(`Template contains placeholders (${placeholders.join(", ")}) but no args defined in frontmatter`)
		}
		return
	}

	const missingArgs: string[] = []
	for (const placeholder of placeholders) {
		if (!(placeholder in args)) {
			missingArgs.push(placeholder)
		}
	}

	if (missingArgs.length > 0) {
		throw new Error(`Template placeholders (${missingArgs.join(", ")}) are missing corresponding args in frontmatter`)
	}
}

/**
 * Replace placeholders in template with actual values
 */
export function replacePlaceholders(template: string, args: Record<string, unknown>): string {
	let result = template
	const placeholders = extractPlaceholders(template)

	for (const placeholder of placeholders) {
		const value = args[placeholder]
		const regex = new RegExp(`\\{\\{${placeholder}\\}\\}`, "g")
		if (value !== undefined && value !== null) {
			result = result.replace(regex, String(value))
		}
		// If value is undefined/null and arg is optional, leave placeholder as-is
	}

	return result
}

import fs from "node:fs/promises"
import path from "node:path"
import { compile, run } from "@mdx-js/mdx"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { parse } from "node-html-parser"
import React from "react"
import * as runtime from "react/jsx-runtime"
import { renderToString } from "react-dom/server"
import { read } from "to-vfile"
import { matter } from "vfile-matter"
import { z } from "zod"
import type { DocsServerConfig } from "../utils/config.js"
import { logger } from "../utils/logger.js"

const PROMPTS_DIR = "prompts"

const ArgDefinitionSchema = z.object({
	type: z.enum(["string", "number", "boolean"]).default("string"),
	required: z.union([z.boolean(), z.string().transform((v) => v.toLowerCase() === "true")]).optional(),
	optional: z.union([z.boolean(), z.string().transform((v) => v.toLowerCase() === "true")]).optional(),
	description: z.string().optional()
})

const PromptFrontmatterSchema = z.object({
	title: z.string().optional(),
	description: z.string().optional(),
	args: z.record(ArgDefinitionSchema).optional()
})

export type PromptFrontmatter = z.infer<typeof PromptFrontmatterSchema>
export type ArgDefinition = z.infer<typeof ArgDefinitionSchema>
export { PromptFrontmatterSchema }

interface LoadedPrompt {
	name: string
	title: string
	description?: string
	argsSchema: z.ZodObject<z.ZodRawShape>
	callback: (args: Record<string, unknown>) => Promise<{
		messages: Array<{ role: "user" | "assistant"; content: { type: "text"; text: string } }>
	}>
}

export async function promptsDirectoryExists(rootDir: string): Promise<boolean> {
	try {
		return (await fs.stat(path.join(rootDir, PROMPTS_DIR))).isDirectory()
	} catch {
		return false
	}
}

export function argsToZodSchema(args: Record<string, ArgDefinition> | undefined): z.ZodObject<z.ZodRawShape> {
	if (!args || Object.keys(args).length === 0) return z.object({})
	const shape: z.ZodRawShape = {}
	for (const [key, arg] of Object.entries(args)) {
		let zodType: z.ZodTypeAny = arg.type === "number" ? z.number() : arg.type === "boolean" ? z.boolean() : z.string()
		if (arg.description) zodType = zodType.describe(arg.description)
		if (arg.optional === true || arg.required === false) zodType = zodType.optional()
		shape[key] = zodType
	}
	return z.object(shape)
}

export async function replacePlaceholders(template: string, args: Record<string, unknown>): Promise<string> {
	const code = String(await compile(template, { outputFormat: "function-body" }))
	const varDeclarations = Object.entries(args)
		.filter(([, val]) => val != null)
		.map(([key, val]) => `const ${key} = ${JSON.stringify(val)};`)
		.join("\n")
	const { default: Content } = await run(varDeclarations ? `${varDeclarations}\n${code}` : code, {
		...runtime,
		baseUrl: import.meta.url
	})
	return parse(renderToString(React.createElement(Content as React.ComponentType))).text.trim()
}

async function loadPromptFromFile(promptsDir: string, fileName: string): Promise<LoadedPrompt | null> {
	const file = await read(path.join(promptsDir, fileName))
	matter(file, { strip: true })
	const name = fileName.replace(/\.(mdx?)$/i, "")
	const frontmatter = PromptFrontmatterSchema.parse(file.data.matter || {})
	const body = typeof file.value === "string" ? file.value.trim() : new TextDecoder().decode(file.value).trim()
	return {
		name,
		title: frontmatter.title ?? name,
		description: frontmatter.description,
		argsSchema: argsToZodSchema(frontmatter.args),
		callback: async (args: Record<string, unknown>) => ({
			messages: [{ role: "user" as const, content: { type: "text" as const, text: await replacePlaceholders(body, args) } }]
		})
	}
}

export async function loadPrompts(rootDir: string): Promise<LoadedPrompt[]> {
	const promptsDir = path.join(rootDir, PROMPTS_DIR)
	if (!(await promptsDirectoryExists(rootDir))) return []
	const prompts: LoadedPrompt[] = []
	for (const entry of await fs.readdir(promptsDir, { withFileTypes: true })) {
		if (!entry.isFile() || (!entry.name.endsWith(".md") && !entry.name.endsWith(".mdx"))) continue
		try {
			const prompt = await loadPromptFromFile(promptsDir, entry.name)
			if (prompt) prompts.push(prompt)
		} catch (error) {
			await logger.warning(`Failed to load prompt from ${entry.name}`, error)
		}
	}
	return prompts
}

export async function registerPrompts(server: McpServer, config: DocsServerConfig): Promise<void> {
	for (const { name, title, description, argsSchema, callback } of await loadPrompts(config.rootDir)) {
		server.registerPrompt(name, { title, description, argsSchema: argsSchema.shape }, callback)
	}
}

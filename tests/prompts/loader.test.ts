import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { loadPrompts, promptsDirectoryExists } from "../../src/handlers/prompts.js"

describe("prompts loader", () => {
	let tempDir: string
	let promptsDir: string

	beforeAll(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-docs-server-test-"))
		promptsDir = path.join(tempDir, "prompts")
		await fs.mkdir(promptsDir, { recursive: true })
	})

	afterAll(async () => {
		await fs.rm(tempDir, { recursive: true, force: true })
	})

	describe("promptsDirectoryExists", () => {
		it("returns true when prompts directory exists", async () => {
			const exists = await promptsDirectoryExists(tempDir)
			expect(exists).toBe(true)
		})

		it("returns false when prompts directory does not exist", async () => {
			const nonExistentDir = path.join(os.tmpdir(), "non-existent-" + Date.now())
			const exists = await promptsDirectoryExists(nonExistentDir)
			expect(exists).toBe(false)
		})
	})

	describe("loadPrompts", () => {
		it("returns empty array when prompts directory does not exist", async () => {
			const nonExistentDir = path.join(os.tmpdir(), "non-existent-" + Date.now())
			const prompts = await loadPrompts(nonExistentDir)
			expect(prompts).toEqual([])
		})

		it("loads simple .md prompt without frontmatter", async () => {
			const promptContent = `# Welcome

Hello! This is a simple prompt.`
			await fs.writeFile(path.join(promptsDir, "welcome.md"), promptContent)

			const prompts = await loadPrompts(tempDir)
			expect(prompts.length).toBe(1)
			expect(prompts[0].name).toBe("welcome")
			expect(prompts[0].title).toBe("welcome")
			expect(prompts[0].description).toBeUndefined()
			expect(prompts[0].argsSchema.shape).toEqual({})

			// Test callback
			const result = await prompts[0].callback({})
			expect(result.messages[0].role).toBe("user")
			expect(result.messages[0].content.type).toBe("text")
			expect(result.messages[0].content.text).toContain("Hello!")
		})

		it("loads .mdx prompt with frontmatter and args", async () => {
			const promptContent = `---
title: Code Review
description: Review code for issues
args:
  code:
    type: string
    required: true
    description: The code to review
  language:
    type: string
    optional: true
---

Review this {language} code:

{code}`

			await fs.writeFile(path.join(promptsDir, "review-code.mdx"), promptContent)

			const prompts = await loadPrompts(tempDir)
			const reviewPrompt = prompts.find((p) => p.name === "review-code")
			expect(reviewPrompt).toBeDefined()
			expect(reviewPrompt?.title).toBe("Code Review")
			expect(reviewPrompt?.description).toBe("Review code for issues")
			expect(reviewPrompt?.argsSchema.shape.code).toBeDefined()
			expect(reviewPrompt?.argsSchema.shape.language).toBeDefined()

			// Test callback with args
			const result = await reviewPrompt!.callback({
				code: "const x = 1",
				language: "javascript"
			})
			expect(result.messages[0].content.text).toContain("javascript")
			expect(result.messages[0].content.text).toContain("const x = 1")
		})

		it("loads prompt with placeholder not in args, but throws when invoked", async () => {
			const promptContent = `---
title: Test Prompt
args:
  name:
    type: string
    required: true
---

Hello {name}, your age is {age}.`

			await fs.writeFile(path.join(promptsDir, "test.mdx"), promptContent)

			// Prompts with placeholders not in args load successfully, but throw when invoked
			const prompts = await loadPrompts(tempDir)
			const testPrompt = prompts.find((p) => p.name === "test")
			expect(testPrompt).toBeDefined()

			// When invoked, {age} is undefined so MDX throws ReferenceError
			await expect(testPrompt!.callback({ name: "Alice" })).rejects.toThrow(ReferenceError)
		})

		it("ignores non-markdown files", async () => {
			await fs.writeFile(path.join(promptsDir, "readme.txt"), "Not a prompt")
			await fs.writeFile(path.join(promptsDir, "script.js"), "console.log('not a prompt')")

			const prompts = await loadPrompts(tempDir)
			const fileNames = prompts.map((p) => p.name)
			expect(fileNames).not.toContain("readme")
			expect(fileNames).not.toContain("script")
		})

		it("loads multiple prompts", async () => {
			await fs.writeFile(path.join(promptsDir, "prompt1.md"), "# Prompt 1")
			await fs.writeFile(
				path.join(promptsDir, "prompt2.mdx"),
				`---
title: Prompt 2
---

Content 2`
			)

			const prompts = await loadPrompts(tempDir)
			expect(prompts.length).toBeGreaterThanOrEqual(2)
			const names = prompts.map((p) => p.name)
			expect(names).toContain("prompt1")
			expect(names).toContain("prompt2")
		})

		it("loads .mdx file without frontmatter as simple prompt", async () => {
			const promptContent = `This is an MDX file without frontmatter.`
			await fs.writeFile(path.join(promptsDir, "no-frontmatter.mdx"), promptContent)

			const prompts = await loadPrompts(tempDir)
			const noFrontmatterPrompt = prompts.find((p) => p.name === "no-frontmatter")
			expect(noFrontmatterPrompt).toBeDefined()
			expect(noFrontmatterPrompt?.title).toBe("no-frontmatter")
			expect(noFrontmatterPrompt?.argsSchema.shape).toEqual({})
		})
	})
})

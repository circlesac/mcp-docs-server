import { toVFile } from "to-vfile"
import { matter } from "vfile-matter"
import { describe, expect, it } from "vitest"
import { argsToZodSchema, PromptFrontmatterSchema, replacePlaceholders } from "../../src/handlers/prompts.js"

describe("parseFrontmatter", () => {
	it("parses frontmatter with title and description", () => {
		const content = `---
title: Test Prompt
description: A test prompt
---

This is the body content.`

		const file = toVFile({ value: content, path: "prompt.mdx" })
		matter(file, { strip: true })
		const data = PromptFrontmatterSchema.parse(file.data.matter || {})

		expect(data).toEqual({
			title: "Test Prompt",
			description: "A test prompt"
		})
		expect(String(file.value).trim()).toBe("This is the body content.")
	})

	it("parses frontmatter with args", () => {
		const content = `---
title: Code Review
args:
  code:
    type: string
    required: true
    description: The code to review
  language:
    type: string
    optional: true
---

Review this code.`

		const file = toVFile({ value: content, path: "prompt.mdx" })
		matter(file, { strip: true })
		const data = PromptFrontmatterSchema.parse(file.data.matter || {})

		expect(data.title).toBe("Code Review")
		expect(data.args).toBeDefined()
		expect(data.args?.code).toEqual({
			type: "string",
			required: true,
			description: "The code to review"
		})
		expect(data.args?.language).toEqual({
			type: "string",
			optional: true
		})
	})

	it("returns empty frontmatter for content without frontmatter", () => {
		const content = `This is just regular content without frontmatter.`
		const file = toVFile({ value: content, path: "prompt.mdx" })
		matter(file, { strip: true })
		const data = PromptFrontmatterSchema.parse(file.data.matter || {})
		const body = String(file.value).trim()

		expect(data).toEqual({})
		expect(body).toBe(content)
	})

	it("handles boolean values in frontmatter", () => {
		const content = `---
title: Test
args:
  flag:
    type: boolean
    required: true
---

Content.`

		const file = toVFile({ value: content, path: "prompt.mdx" })
		matter(file, { strip: true })
		const data = PromptFrontmatterSchema.parse(file.data.matter || {})

		expect(data.args?.flag?.type).toBe("boolean")
		expect(data.args?.flag?.required).toBe(true)
	})

	it("handles number types", () => {
		const content = `---
args:
  count:
    type: number
    required: true
---

Content.`

		const file = toVFile({ value: content, path: "prompt.mdx" })
		matter(file, { strip: true })
		const data = PromptFrontmatterSchema.parse(file.data.matter || {})

		expect(data.args?.count?.type).toBe("number")
	})
})

describe("argsToZodSchema", () => {
	it("returns empty object schema for undefined args", () => {
		const schema = argsToZodSchema(undefined)
		expect(schema.shape).toEqual({})
	})

	it("returns empty object schema for empty args", () => {
		const schema = argsToZodSchema({})
		expect(schema.shape).toEqual({})
	})

	it("converts string args to Zod string schema", () => {
		const schema = argsToZodSchema({
			name: { type: "string", required: true, description: "A name" }
		})
		expect(schema.shape.name).toBeDefined()
	})

	it("converts number args to Zod number schema", () => {
		const schema = argsToZodSchema({
			count: { type: "number", required: true }
		})
		expect(schema.shape.count).toBeDefined()
	})

	it("converts boolean args to Zod boolean schema", () => {
		const schema = argsToZodSchema({
			flag: { type: "boolean", required: true }
		})
		expect(schema.shape.flag).toBeDefined()
	})

	it("makes optional args optional in schema", () => {
		const schema = argsToZodSchema({
			name: { type: "string", optional: true }
		})
		// Optional fields in Zod don't throw errors when undefined
		const result = schema.safeParse({})
		expect(result.success).toBe(true)
	})

	it("handles required args", () => {
		const schema = argsToZodSchema({
			name: { type: "string", required: true }
		})
		const result = schema.safeParse({})
		expect(result.success).toBe(false)
	})
})

describe("replacePlaceholders", () => {
	it("replaces single placeholder", async () => {
		const template = "Hello {name}!"
		const result = await replacePlaceholders(template, { name: "World" })
		expect(result).toBe("Hello World!")
	})

	it("replaces multiple placeholders", async () => {
		const template = "Hello {name}, you are {age} years old."
		const result = await replacePlaceholders(template, { name: "Alice", age: "30" })
		expect(result).toBe("Hello Alice, you are 30 years old.")
	})

	it("replaces same placeholder multiple times", async () => {
		const template = "{name} and {name}"
		const result = await replacePlaceholders(template, { name: "Bob" })
		expect(result).toBe("Bob and Bob")
	})

	it("throws error when value is undefined", async () => {
		const template = "Hello {name}!"
		// MDX throws ReferenceError when variable is undefined
		await expect(replacePlaceholders(template, {})).rejects.toThrow(ReferenceError)
	})

	it("throws error when value is null", async () => {
		const template = "Value: {value}"
		// MDX throws ReferenceError when variable is null (we filter null out, so it's undefined)
		await expect(replacePlaceholders(template, { value: null as unknown as string })).rejects.toThrow(ReferenceError)
	})

	it("converts non-string values to strings", async () => {
		const template = "Count: {count}"
		const result = await replacePlaceholders(template, { count: 42 })
		expect(result).toBe("Count: 42")
	})
})

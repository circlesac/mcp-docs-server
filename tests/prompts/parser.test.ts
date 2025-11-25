import { describe, expect, it } from "vitest"
import { argsToZodSchema, extractPlaceholders, parseFrontmatter, replacePlaceholders, validatePlaceholders } from "../../src/prompts/parser.js"

describe("parseFrontmatter", () => {
	it("parses frontmatter with title and description", () => {
		const content = `---
title: Test Prompt
description: A test prompt
---

This is the body content.`

		const result = parseFrontmatter(content)
		expect(result.frontmatter).toEqual({
			title: "Test Prompt",
			description: "A test prompt"
		})
		expect(result.body).toBe("This is the body content.")
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

		const result = parseFrontmatter(content)
		expect(result.frontmatter?.title).toBe("Code Review")
		expect(result.frontmatter?.args).toBeDefined()
		expect(result.frontmatter?.args?.code).toEqual({
			type: "string",
			required: true,
			description: "The code to review"
		})
		expect(result.frontmatter?.args?.language).toEqual({
			type: "string",
			optional: true
		})
	})

	it("returns null frontmatter for content without frontmatter", () => {
		const content = `This is just regular content without frontmatter.`
		const result = parseFrontmatter(content)
		expect(result.frontmatter).toBeNull()
		expect(result.body).toBe(content)
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

		const result = parseFrontmatter(content)
		expect(result.frontmatter?.args?.flag?.type).toBe("boolean")
		expect(result.frontmatter?.args?.flag?.required).toBe(true)
	})

	it("handles number types", () => {
		const content = `---
args:
  count:
    type: number
    required: true
---

Content.`

		const result = parseFrontmatter(content)
		expect(result.frontmatter?.args?.count?.type).toBe("number")
	})
})

describe("extractPlaceholders", () => {
	it("extracts single placeholder", () => {
		const content = "Hello {{name}}!"
		const placeholders = extractPlaceholders(content)
		expect(placeholders).toEqual(["name"])
	})

	it("extracts multiple placeholders", () => {
		const content = "Hello {{name}}, you are {{age}} years old."
		const placeholders = extractPlaceholders(content)
		expect(placeholders).toContain("name")
		expect(placeholders).toContain("age")
		expect(placeholders.length).toBe(2)
	})

	it("extracts unique placeholders", () => {
		const content = "{{name}} and {{name}} again"
		const placeholders = extractPlaceholders(content)
		expect(placeholders).toEqual(["name"])
	})

	it("validates placeholder names (alphanumeric + underscores)", () => {
		const content = "{{valid_name}} {{invalid-name}} {{123}}"
		const placeholders = extractPlaceholders(content)
		expect(placeholders).toContain("valid_name")
		expect(placeholders).toContain("123")
		expect(placeholders).not.toContain("invalid-name")
	})

	it("returns empty array for content without placeholders", () => {
		const content = "This has no placeholders."
		const placeholders = extractPlaceholders(content)
		expect(placeholders).toEqual([])
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

describe("validatePlaceholders", () => {
	it("passes validation when all placeholders have args", () => {
		const placeholders = ["name", "age"]
		const args = {
			name: { type: "string" as const, required: true },
			age: { type: "number" as const, required: true }
		}
		expect(() => validatePlaceholders(placeholders, args)).not.toThrow()
	})

	it("throws error when placeholder is missing from args", () => {
		const placeholders = ["name", "age"]
		const args = {
			name: { type: "string" as const, required: true }
		}
		expect(() => validatePlaceholders(placeholders, args)).toThrow("missing corresponding args")
	})

	it("passes validation when no placeholders and no args", () => {
		expect(() => validatePlaceholders([], undefined)).not.toThrow()
	})

	it("throws error when placeholders exist but no args defined", () => {
		const placeholders = ["name"]
		expect(() => validatePlaceholders(placeholders, undefined)).toThrow("no args defined")
	})
})

describe("replacePlaceholders", () => {
	it("replaces single placeholder", () => {
		const template = "Hello {{name}}!"
		const result = replacePlaceholders(template, { name: "World" })
		expect(result).toBe("Hello World!")
	})

	it("replaces multiple placeholders", () => {
		const template = "Hello {{name}}, you are {{age}} years old."
		const result = replacePlaceholders(template, { name: "Alice", age: "30" })
		expect(result).toBe("Hello Alice, you are 30 years old.")
	})

	it("replaces same placeholder multiple times", () => {
		const template = "{{name}} and {{name}}"
		const result = replacePlaceholders(template, { name: "Bob" })
		expect(result).toBe("Bob and Bob")
	})

	it("leaves placeholder when value is undefined", () => {
		const template = "Hello {{name}}!"
		const result = replacePlaceholders(template, {})
		expect(result).toBe("Hello {{name}}!")
	})

	it("handles null values", () => {
		const template = "Value: {{value}}"
		const result = replacePlaceholders(template, { value: null as unknown as string })
		expect(result).toBe("Value: {{value}}")
	})

	it("converts non-string values to strings", () => {
		const template = "Count: {{count}}"
		const result = replacePlaceholders(template, { count: 42 })
		expect(result).toBe("Count: 42")
	})
})

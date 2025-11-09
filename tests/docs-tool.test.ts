import path from "node:path"
import { fileURLToPath } from "node:url"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { clearConfigCache, loadConfig } from "../src/config.js"
import { createDocsTool } from "../src/tools/docs.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.resolve(__dirname, "__fixtures__", "acme")
const configPath = path.join(fixtureRoot, "mcp-docs-server.json")

describe("generic docs tool", () => {
	let docsTool: Awaited<ReturnType<typeof createDocsTool>>

	beforeAll(async () => {
		await loadConfig({ configPath })
		docsTool = await createDocsTool()
	})

	afterAll(() => {
		clearConfigCache()
	})

	it("exposes a generated tool name", () => {
		expect(docsTool.name).toBe("searchAcme")
	})

	it("returns markdown content for a requested file", async () => {
		const result = await docsTool.execute({ paths: ["index.md"] })
		expect(result).toContain("Acme documentation")
		expect(result).toContain("## index.md")
	})

	it("lists directory contents and aggregates files", async () => {
		const result = await docsTool.execute({ paths: ["company"] })
		expect(result).toContain("Directory contents of company")
		expect(result).toContain("- docs/company/operations.md")
		expect(result).toContain("Employee ID Policy")
	})

	it("suggests related files when the path is unknown", async () => {
		const result = await docsTool.execute({ paths: ["unknown/path"], queryKeywords: ["company"] })
		expect(result).toContain('Path "unknown/path" not found')
		expect(result).toMatch(/company\/operations\.md/)
	})

	it("rejects path traversal attempts", async () => {
		const result = await docsTool.execute({ paths: ["../package.json"] })
		expect(result).toContain("Invalid path")
	})

	it("serves nested manual content", async () => {
		const result = await docsTool.execute({ paths: ["manuals/quickstart.md"] })
		expect(result).toContain("Quickstart Manual")
	})

	it("handles multiple paths in one request", async () => {
		const result = await docsTool.execute({ paths: ["index.md", "company/operations.md"] })
		expect(result).toContain("## index.md")
		expect(result).toContain("## company/operations.md")
	})
})

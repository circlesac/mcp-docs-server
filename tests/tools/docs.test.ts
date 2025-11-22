import path from "node:path"
import { fileURLToPath } from "node:url"
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js"
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js"
import { readPackageUpSync } from "read-package-up"
import { beforeAll, describe, expect, it } from "vitest"

import { loadConfig } from "../../src/config.js"
import { createDocsTool } from "../../src/tools/docs.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.resolve(__dirname, "..", "__fixtures__", "acme")
const configPath = path.join(fixtureRoot, "mcp-docs-server.json")

// Find templatePath from npm package
const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const packageRootResult = readPackageUpSync({ cwd: moduleDir })
if (!packageRootResult?.path) {
	throw new Error("package.json not found. This indicates a packaging error.")
}
const packageRoot = path.dirname(packageRootResult.path)
const templatePath = path.join(packageRoot, "templates", "docs.mdx")

describe("generic docs tool", () => {
	let docsTool: Awaited<ReturnType<typeof createDocsTool>>

	beforeAll(async () => {
		const config = loadConfig({ configPath, templatePath })
		docsTool = await createDocsTool(config)
	})

	it("exposes a generated tool name", () => {
		expect(docsTool.name).toBe("searchAcme")
	})

	const emptyExtra = {
		signal: new AbortController().signal
	} as RequestHandlerExtra<ServerRequest, ServerNotification>

	it("returns markdown content for a requested file", async () => {
		const result = await docsTool.cb({ paths: ["index.md"] }, emptyExtra)
		const textContent = result.content[0]?.type === "text" ? result.content[0].text : ""
		expect(textContent).toContain("Acme documentation")
		expect(textContent).toContain("## index.md")
	})

	it("lists directory contents and aggregates files", async () => {
		const result = await docsTool.cb({ paths: ["company"] }, emptyExtra)
		const textContent = result.content[0]?.type === "text" ? result.content[0].text : ""
		expect(textContent).toContain("Directory contents of company")
		expect(textContent).toContain("- docs/company/operations.md")
		expect(textContent).toContain("Employee ID Policy")
	})

	it("suggests related files when the path is unknown", async () => {
		const result = await docsTool.cb({ paths: ["unknown/path"], queryKeywords: ["company"] }, emptyExtra)
		const textContent = result.content[0]?.type === "text" ? result.content[0].text : ""
		expect(textContent).toContain('Path "unknown/path" not found')
		expect(textContent).toMatch(/company\/operations\.md/)
	})

	it("rejects path traversal attempts", async () => {
		const result = await docsTool.cb({ paths: ["../package.json"] }, emptyExtra)
		const textContent = result.content[0]?.type === "text" ? result.content[0].text : ""
		expect(textContent).toContain("Invalid path")
	})

	it("serves nested manual content", async () => {
		const result = await docsTool.cb({ paths: ["manuals/quickstart.md"] }, emptyExtra)
		const textContent = result.content[0]?.type === "text" ? result.content[0].text : ""
		expect(textContent).toContain("Quickstart Manual")
	})

	it("handles multiple paths in one request", async () => {
		const result = await docsTool.cb({ paths: ["index.md", "company/operations.md"] }, emptyExtra)
		const textContent = result.content[0]?.type === "text" ? result.content[0].text : ""
		expect(textContent).toContain("## index.md")
		expect(textContent).toContain("## company/operations.md")
	})
})

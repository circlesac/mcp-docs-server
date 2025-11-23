import path from "node:path"
import { fileURLToPath } from "node:url"
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js"
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js"
import { readPackageUpSync } from "read-package-up"
import { beforeAll, describe, expect, it } from "vitest"

import { loadConfig } from "../../src/config.js"
import { createDocsTool } from "../../src/tools/docs.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..", "..")
const configPath = path.join(repoRoot, "mcp-docs-server.json")

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
		expect(docsTool.name).toBe("searchMcpDocsServer")
	})

	const emptyExtra = {
		signal: new AbortController().signal
	} as RequestHandlerExtra<ServerRequest, ServerNotification>

	it("returns markdown content for a requested file", async () => {
		const result = await docsTool.cb({ paths: ["index.md"] }, emptyExtra)
		const textContent = result.content[0]?.type === "text" ? result.content[0].text : ""
		expect(textContent).toContain("mcp-docs-server")
		expect(textContent).toContain("## index.md")
	})

	it("lists directory contents and aggregates files", async () => {
		const result = await docsTool.cb({ paths: ["overview"] }, emptyExtra)
		const textContent = result.content[0]?.type === "text" ? result.content[0].text : ""
		expect(textContent).toContain("Directory contents of overview")
		expect(textContent).toContain("- docs/overview/")
	})

	it("suggests related files when the path is unknown", async () => {
		const result = await docsTool.cb({ paths: ["unknown/path"], queryKeywords: ["overview"] }, emptyExtra)
		const textContent = result.content[0]?.type === "text" ? result.content[0].text : ""
		expect(textContent).toContain('Path "unknown/path" not found')
		expect(textContent).toMatch(/overview/)
	})

	it("rejects path traversal attempts", async () => {
		const result = await docsTool.cb({ paths: ["../package.json"] }, emptyExtra)
		const textContent = result.content[0]?.type === "text" ? result.content[0].text : ""
		expect(textContent).toContain("Invalid path")
	})

	it("serves nested content", async () => {
		const result = await docsTool.cb({ paths: ["overview/getting-started.md"] }, emptyExtra)
		const textContent = result.content[0]?.type === "text" ? result.content[0].text : ""
		expect(textContent).toContain("getting-started")
	})

	it("handles multiple paths in one request", async () => {
		const result = await docsTool.cb({ paths: ["index.md", "overview/configuration.md"] }, emptyExtra)
		const textContent = result.content[0]?.type === "text" ? result.content[0].text : ""
		expect(textContent).toContain("## index.md")
		expect(textContent).toContain("## overview/configuration.md")
	})
})

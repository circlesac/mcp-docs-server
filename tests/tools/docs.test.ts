import path from "node:path"
import { fileURLToPath } from "node:url"
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js"
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js"
import { readPackageUpSync } from "read-package-up"
import { toVFile } from "to-vfile"
import { matter } from "vfile-matter"
import { beforeAll, describe, expect, it } from "vitest"
import { createDocsTool } from "../../src/tools/docs.js"
import { loadConfig } from "../../src/utils/config.js"

function parseFrontmatter(text: string): { frontmatter: Record<string, unknown>; body: string } {
	const file = toVFile({ value: text, path: "test.md" })
	matter(file, { strip: true })
	return {
		frontmatter: (file.data.matter as Record<string, unknown>) || {},
		body: String(file.value).trim()
	}
}

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

	it("returns structured data for a requested file", async () => {
		const result = await docsTool.cb({ paths: ["index.md"] }, emptyExtra)
		expect(result.content).toBeDefined()
		expect(result.content).toHaveLength(1)
		const textContent = result.content[0]?.type === "text" ? result.content[0].text : ""
		const { frontmatter, body } = parseFrontmatter(textContent)
		expect(frontmatter.path).toBe("index.md")
		expect(body).toBeDefined()
		expect(body).toContain("mcp-docs-server")
	})

	it("lists directory contents and aggregates files", async () => {
		const result = await docsTool.cb({ paths: ["commands"] }, emptyExtra)
		expect(result.content).toBeDefined()
		expect(result.content).toHaveLength(1)
		const textContent = result.content[0]?.type === "text" ? result.content[0].text : ""
		const { frontmatter, body } = parseFrontmatter(textContent)
		expect(frontmatter.path).toBe("commands")
		expect(body).toBeDefined()
		expect(body).toContain("Directory:")
		expect(body).toContain("Files")
		// Directory results now only include listings, not file contents
		expect(body).not.toContain("File Contents")
	})

	it("suggests related files when the path is unknown", async () => {
		const result = await docsTool.cb({ paths: ["unknown/path"], queryKeywords: ["commands"] }, emptyExtra)
		expect(result.content).toBeDefined()
		expect(result.content).toHaveLength(1)
		const textContent = result.content[0]?.type === "text" ? result.content[0].text : ""
		const { frontmatter, body } = parseFrontmatter(textContent)
		expect(frontmatter.path).toBe("unknown/path")
		expect(frontmatter.error).toBeDefined()
		expect(frontmatter.error).toContain('Path "unknown/path" not found')
		// availablePaths is now in the body, not frontmatter
		expect(body).toContain("Available top-level paths")
		expect(body).toMatch(/commands/)
		expect(body).toContain('Path "unknown/path" not found')
	})

	it("rejects path traversal attempts", async () => {
		const result = await docsTool.cb({ paths: ["../package.json"] }, emptyExtra)
		expect(result.content).toBeDefined()
		expect(result.content).toHaveLength(1)
		const textContent = result.content[0]?.type === "text" ? result.content[0].text : ""
		const { frontmatter, body } = parseFrontmatter(textContent)
		expect(frontmatter.path).toBe("../package.json")
		expect(frontmatter.error).toBe("Invalid path")
		expect(body).toBe("Invalid path")
	})

	it("serves nested content", async () => {
		const result = await docsTool.cb({ paths: ["getting-started.md"] }, emptyExtra)
		expect(result.content).toBeDefined()
		expect(result.content).toHaveLength(1)
		const textContent = result.content[0]?.type === "text" ? result.content[0].text : ""
		const { frontmatter, body } = parseFrontmatter(textContent)
		expect(frontmatter.path).toBe("getting-started.md")
		expect(body).toBeDefined()
		expect(body).toContain("Getting Started")
	})

	it("handles multiple paths in one request", async () => {
		const result = await docsTool.cb({ paths: ["index.md", "configuration.md"] }, emptyExtra)
		expect(result.content).toBeDefined()
		expect(result.content).toHaveLength(2)
		const textContent1 = result.content[0]?.type === "text" ? result.content[0].text : ""
		const textContent2 = result.content[1]?.type === "text" ? result.content[1].text : ""
		const { frontmatter: frontmatter1, body: body1 } = parseFrontmatter(textContent1)
		const { frontmatter: frontmatter2, body: body2 } = parseFrontmatter(textContent2)
		expect(frontmatter1.path).toBe("index.md")
		expect(frontmatter2.path).toBe("configuration.md")
		expect(body1).toBeDefined()
		expect(body2).toBeDefined()
	})
})

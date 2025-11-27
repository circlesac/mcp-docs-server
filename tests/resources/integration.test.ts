import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { readPackageUpSync } from "read-package-up"
import { describe, expect, it } from "vitest"
import { registerResources, resourcesDirectoryExists } from "../../src/handlers/resources.js"
import { loadConfig } from "../../src/utils/config.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..", "..")
const configPath = path.join(repoRoot, "mcp-docs-server.json")

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const packageRootResult = readPackageUpSync({ cwd: moduleDir })
if (!packageRootResult?.path) {
	throw new Error("package.json not found. This indicates a packaging error.")
}
const packageRoot = path.dirname(packageRootResult.path)
const templatePath = path.join(packageRoot, "templates", "docs.mdx")

describe("resources integration", () => {
	it("detects resources directory exists", async () => {
		const config = loadConfig({ configPath, templatePath })
		const exists = await resourcesDirectoryExists(config.rootDir)
		expect(exists).toBe(true)
	})

	it("registers resources when resources directory exists", async () => {
		const config = loadConfig({ configPath, templatePath })
		const server = new McpServer({ name: config.name, version: config.version })
		await expect(registerResources(server, config)).resolves.not.toThrow()
	})

	it("handles missing resources directory gracefully", async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-docs-server-test-"))
		const tempConfigPath = path.join(tempDir, "mcp-docs-server.json")
		await fs.writeFile(
			tempConfigPath,
			JSON.stringify({
				name: "Test",
				package: "@test/test",
				version: "0.1.0"
			})
		)
		await fs.mkdir(path.join(tempDir, "docs"), { recursive: true })
		await fs.writeFile(path.join(tempDir, "docs", "test.md"), "# Test")

		const config = loadConfig({ configPath: tempConfigPath, templatePath })
		const server = new McpServer({ name: config.name, version: config.version })
		await expect(registerResources(server, config)).resolves.not.toThrow()

		await fs.rm(tempDir, { recursive: true, force: true })
	})

	it("loads templates.json correctly", async () => {
		const config = loadConfig({ configPath, templatePath })
		const templatesPath = path.join(config.rootDir, "resources", "templates.json")
		const templatesContent = await fs.readFile(templatesPath, "utf-8")
		const templates = JSON.parse(templatesContent)

		expect(Array.isArray(templates)).toBe(true)
		expect(templates.length).toBeGreaterThan(0)
		expect(templates[0].uriTemplate).toBeDefined()
		expect(templates[0].name).toBeDefined()
	})
})

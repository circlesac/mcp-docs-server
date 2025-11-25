import path from "node:path"
import { fileURLToPath } from "node:url"
import { readPackageUpSync } from "read-package-up"
import { describe, expect, it } from "vitest"

import { loadConfig } from "../../src/config.js"
import { registerPrompts } from "../../src/prompts/index.js"
import { loadPrompts } from "../../src/prompts/loader.js"

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

describe("prompts integration", () => {
	it("loads prompts from prompts directory", async () => {
		const config = loadConfig({ configPath, templatePath })
		const prompts = await loadPrompts(config.rootDir)

		expect(prompts.length).toBeGreaterThan(0)

		// Verify we have the expected prompts from the prompts/ directory
		const promptNames = prompts.map((p) => p.name)
		expect(promptNames).toContain("setup-guide")
		expect(promptNames).toContain("query-docs")
		expect(promptNames).toContain("deploy-cloudflare")
	})

	it("prompts have correct structure", async () => {
		const config = loadConfig({ configPath, templatePath })
		const prompts = await loadPrompts(config.rootDir)

		const setupGuide = prompts.find((p) => p.name === "setup-guide")
		expect(setupGuide).toBeDefined()
		expect(setupGuide?.title).toBeDefined()
		expect(setupGuide?.description).toBeDefined()
		expect(setupGuide?.argsSchema).toBeDefined()
		expect(setupGuide?.callback).toBeDefined()
	})

	it("can invoke prompt callback with arguments", async () => {
		const config = loadConfig({ configPath, templatePath })
		const prompts = await loadPrompts(config.rootDir)

		const queryDocs = prompts.find((p) => p.name === "query-docs")
		expect(queryDocs).toBeDefined()

		// Invoke the prompt callback with arguments
		const result = queryDocs!.callback({
			topic: "deployment",
			context: "I need help with Cloudflare"
		})

		expect(result).toBeDefined()
		expect(result.messages).toBeDefined()
		expect(result.messages.length).toBeGreaterThan(0)
		expect(result.messages[0].role).toBe("user")
		expect(result.messages[0].content.type).toBe("text")
		if (result.messages[0].content.type === "text") {
			expect(result.messages[0].content.text).toContain("deployment")
			expect(result.messages[0].content.text).toContain("Cloudflare")
		}
	})

	it("can invoke simple prompt without arguments", async () => {
		const config = loadConfig({ configPath, templatePath })
		const prompts = await loadPrompts(config.rootDir)

		const setupGuide = prompts.find((p) => p.name === "setup-guide")
		expect(setupGuide).toBeDefined()

		const result = setupGuide!.callback({})
		expect(result).toBeDefined()
		expect(result.messages).toBeDefined()
		expect(result.messages.length).toBeGreaterThan(0)
		expect(result.messages[0].role).toBe("user")
		expect(result.messages[0].content.type).toBe("text")
		if (result.messages[0].content.type === "text") {
			expect(result.messages[0].content.text).toContain("Getting Started")
		}
	})

	it("registers prompts with MCP server without errors", async () => {
		const config = loadConfig({ configPath, templatePath })
		const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js")
		const server = new McpServer({
			name: config.name,
			version: config.version
		})

		// Should not throw when registering prompts
		await expect(registerPrompts(server, config)).resolves.not.toThrow()

		// Verify prompts were loaded (indirectly by checking they exist)
		const prompts = await loadPrompts(config.rootDir)
		expect(prompts.length).toBeGreaterThan(0)
	})
})

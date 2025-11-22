import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { buildDockerImage, dockerExec, localSpawn, startContainer, stopContainer } from "./utils/docker.js"

const STDIO_CONTAINER = "mcp-docs-server-stdio-test"
const REMOTE_CONTAINER = "mcp-docs-server-remote-test"

// Get the test fixtures directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES_DIR = path.join(__dirname, "__fixtures__", "acme")

// Temporary test directory on host (will be created in beforeAll)
let tempTestDir: string | null = null

// Shared test logic for MCP server functionality
async function testMcpServer(client: Client): Promise<void> {
	// Test 1: Connect and verify server info
	const serverVersion = client.getServerVersion()
	expect(serverVersion).toBeDefined()
	expect(serverVersion?.name).toBeDefined()
	expect(serverVersion?.version).toBeDefined()

	// Test 2: List tools
	const toolsResult = await client.listTools()
	expect(toolsResult.tools).toBeDefined()
	expect(toolsResult.tools.length).toBeGreaterThan(0)

	const tool = toolsResult.tools[0]
	expect(tool.name).toBeDefined()
	expect(tool.description).toBeDefined()
	expect(tool.inputSchema).toBeDefined()

	// Test 3: Call tool with single path
	const singlePathResult = await client.callTool({
		name: tool.name,
		arguments: {
			paths: ["index.md"]
		}
	})

	expect(singlePathResult).toBeDefined()
	const singleContent = "content" in singlePathResult ? (singlePathResult.content as Array<{ type: string; text?: string }>) : []
	expect(singleContent).toBeDefined()
	expect(Array.isArray(singleContent)).toBe(true)
	expect(singleContent.length).toBeGreaterThan(0)
	const textContent = singleContent[0]
	if (textContent && textContent.type === "text" && textContent.text) {
		expect(textContent.text).toContain("## index.md")
	}

	// Test 4: Call tool with multiple paths
	const multiPathResult = await client.callTool({
		name: tool.name,
		arguments: {
			paths: ["index.md", "company"]
		}
	})

	expect(multiPathResult).toBeDefined()
	const multiContent = "content" in multiPathResult ? (multiPathResult.content as Array<{ type: string; text?: string }>) : []
	expect(multiContent).toBeDefined()
	expect(Array.isArray(multiContent)).toBe(true)
	expect(multiContent.length).toBeGreaterThan(0)
	const multiTextContent = multiContent[0]
	if (multiTextContent && multiTextContent.type === "text" && multiTextContent.text) {
		expect(multiTextContent.text).toContain("## index.md")
		expect(multiTextContent.text).toContain("## company")
	}

	// Test 5: Call tool with query keywords
	const queryResult = await client.callTool({
		name: tool.name,
		arguments: {
			paths: ["index.md"],
			queryKeywords: ["acme", "documentation"]
		}
	})

	expect(queryResult).toBeDefined()
	const queryContent = "content" in queryResult ? (queryResult.content as Array<unknown>) : []
	expect(queryContent).toBeDefined()
	expect(Array.isArray(queryContent)).toBe(true)
	expect(queryContent.length).toBeGreaterThan(0)

	// Test 6: Call tool with non-existent path (should return error message)
	const errorResult = await client.callTool({
		name: tool.name,
		arguments: {
			paths: ["nonexistent-file.md"]
		}
	})

	expect(errorResult).toBeDefined()
	const errorContent = "content" in errorResult ? (errorResult.content as Array<{ type: string; text?: string }>) : []
	expect(errorContent).toBeDefined()
	expect(Array.isArray(errorContent)).toBe(true)
	expect(errorContent.length).toBeGreaterThan(0)
	const errorTextContent = errorContent[0]
	if (errorTextContent && errorTextContent.type === "text" && errorTextContent.text) {
		expect(errorTextContent.text).toContain("not found")
	}
}

describe("MCP Server Tests", () => {
	beforeAll(async () => {
		await buildDockerImage()
		await startContainer(STDIO_CONTAINER)

		// Create temporary test directory on host for remote tests
		tempTestDir = path.join(process.cwd(), ".test-temp", "remote-mcp")
		await fs.promises.mkdir(tempTestDir, { recursive: true })

		// Copy fixtures to temp directory
		await fs.promises.cp(FIXTURES_DIR, tempTestDir, { recursive: true })

		// Start container with volume mount for the test directory
		await startContainer(REMOTE_CONTAINER, undefined, {
			hostPath: tempTestDir,
			containerPath: "/acme-docs"
		})
	}, 120000)

	afterAll(async () => {
		await stopContainer(STDIO_CONTAINER)
		await stopContainer(REMOTE_CONTAINER)

		// Clean up temp directory
		if (tempTestDir) {
			await fs.promises.rm(tempTestDir, { recursive: true, force: true }).catch(() => {})
		}
	}, 30000)

	describe("stdio transport", () => {
		it("should connect, list tools, and call tools with various args", async () => {
			const client = new Client(
				{
					name: "test-client",
					version: "1.0.0"
				},
				{
					capabilities: {}
				}
			)

			const transport = new StdioClientTransport({
				command: "docker",
				args: ["exec", "-i", STDIO_CONTAINER, "sh", "-c", "cd /acme-docs && npx @circlesac/mcp-docs-server serve"]
			})

			await client.connect(transport)
			await testMcpServer(client)
			await transport.close()
		}, 30000)
	})

	describe("remote transport (SSE)", () => {
		it("should connect, list tools, and call tools with various args", async () => {
			if (!tempTestDir) {
				throw new Error("tempTestDir not initialized")
			}

			// Step 1: Build the Cloudflare Worker in Docker (outputs to mounted volume)
			await dockerExec("cd /acme-docs && npx @circlesac/mcp-docs-server cloudflare --dry-run", REMOTE_CONTAINER)
			await dockerExec("cd /acme-docs/.build/cloudflare && npm install", REMOTE_CONTAINER)
			await dockerExec("cd /acme-docs/.build/cloudflare && npx wrangler types", REMOTE_CONTAINER)

			// Step 2: Run wrangler dev locally (not in Docker)
			const buildDir = path.join(tempTestDir, ".build", "cloudflare")
			const { process: wranglerProc, output: wranglerOutput } = await localSpawn("npx wrangler dev --port 8787", buildDir)

			// Step 3: Wait for server to be ready
			let serverReady = false

			// Wait up to 40 seconds for server to respond
			for (let i = 0; i < 40; i++) {
				try {
					const controller = new AbortController()
					const timeoutId = setTimeout(() => controller.abort(), 3000)

					const response = await fetch("http://localhost:8787/mcp", {
						method: "GET",
						headers: { Accept: "text/event-stream" },
						signal: controller.signal
					})
					clearTimeout(timeoutId)

					// Any response (even error) means server is up and responding
					// eslint-disable-next-line no-console
					console.log(`✓ Server responded with status ${response.status} on attempt ${i + 1}`)
					// Give it a moment to fully initialize
					await new Promise((resolve) => setTimeout(resolve, 2000))
					serverReady = true
					break
				} catch (_error) {
					// eslint-disable-next-line no-console
					if (i % 10 === 0) console.log(`Waiting for server... attempt ${i + 1}/40`)
				}
				await new Promise((resolve) => setTimeout(resolve, 1000))
			}

			if (!serverReady) {
				wranglerProc.kill("SIGTERM")
				const wranglerLogs = await wranglerOutput.catch(() => "Failed to get wrangler output")

				console.error("Wrangler dev output:", wranglerLogs)
				throw new Error("Wrangler dev server did not start in time")
			}

			try {
				const client = new Client(
					{
						name: "test-client",
						version: "1.0.0"
					},
					{
						capabilities: {}
					}
				)

				// Use StreamableHTTP transport for /mcp endpoint
				// Connect to local wrangler dev instance
				const transport = new StreamableHTTPClientTransport(new URL("http://localhost:8787/mcp"))

				await client.connect(transport)
				await testMcpServer(client)
				await transport.close()
			} catch (error) {
				// Capture wrangler output on error
				const wranglerLogs = await wranglerOutput.catch(() => "Failed to get wrangler output")

				console.error("Wrangler dev output on error:", wranglerLogs)
				throw error
			} finally {
				// Kill wrangler dev
				wranglerProc.kill("SIGTERM")
				const wranglerLogs = await wranglerOutput.catch(() => "")
				if (wranglerLogs) {
					// eslint-disable-next-line no-console
					console.log("Wrangler dev output:", wranglerLogs)
				}
				await new Promise((resolve) => setTimeout(resolve, 2000))
			}
		}, 90000)
	})
})

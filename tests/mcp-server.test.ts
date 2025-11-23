import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { buildDockerImage, dockerExec, localSpawn, startContainer, stopContainer } from "./utils/docker.js"

const STDIO_CONTAINER = "mcp-docs-server-stdio-test"
const REMOTE_CONTAINER = "mcp-docs-server-remote-test"

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
			paths: ["index.md", "overview"]
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
		expect(multiTextContent.text).toContain("## overview")
	}

	// Test 5: Call tool with query keywords
	const queryResult = await client.callTool({
		name: tool.name,
		arguments: {
			paths: ["index.md"],
			queryKeywords: ["mcp", "documentation"]
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
	// Random temp build directory for remote tests (to avoid conflicts)
	let tempBuildDir: string | null = null

	beforeAll(async () => {
		await buildDockerImage()
		await startContainer(STDIO_CONTAINER)

		// Create random temp build directory on host (mounted into Docker container)
		tempBuildDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mcp-docs-server-test-"))

		// Start container - Docker image already has docs and config in /mcp-docs-server
		// Mount temp build directory so we can access build output from host
		await startContainer(REMOTE_CONTAINER, undefined, {
			hostPath: tempBuildDir,
			containerPath: "/mcp-docs-server/.build"
		})

		// Copy pre-built Cloudflare Worker from /tmp (where Dockerfile saved it) to mounted volume
		// This avoids running npm install and wrangler types during the test
		await dockerExec("mkdir -p /mcp-docs-server/.build/cloudflare && cp -r /tmp/cloudflare-build/* /mcp-docs-server/.build/cloudflare/ 2>/dev/null || true", REMOTE_CONTAINER)
	}, 120000)

	afterAll(async () => {
		await stopContainer(STDIO_CONTAINER)
		await stopContainer(REMOTE_CONTAINER)

		// Clean up temp build directory
		if (tempBuildDir) {
			await fs.promises.rm(tempBuildDir, { recursive: true, force: true }).catch(() => {})
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
				args: ["exec", "-i", STDIO_CONTAINER, "sh", "-c", "cd /mcp-docs-server && npx test-mcp-docs-server"]
			})

			await client.connect(transport)
			await testMcpServer(client)
			await transport.close()
		}, 30000)
	})

	describe("remote transport (streamable HTTP)", () => {
		it("should connect, list tools, and call tools with various args", async () => {
			if (!tempBuildDir) {
				throw new Error("tempBuildDir not initialized")
			}

			// Step 1: Run wrangler dev locally from pre-built directory (already built in Dockerfile)
			const buildDir = path.join(tempBuildDir, "cloudflare")
			const { process: wranglerProc, output: wranglerOutput } = await localSpawn("npx wrangler dev --port 8787", buildDir)

			// Step 3: Wait for server to be ready
			let serverReady = false

			// Wait up to 20 seconds for server to respond (reduced from 40 since it usually responds quickly)
			for (let i = 0; i < 20; i++) {
				try {
					const controller = new AbortController()
					const timeoutId = setTimeout(() => controller.abort(), 2000)

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
					await new Promise((resolve) => setTimeout(resolve, 1000))
					serverReady = true
					break
				} catch (_error) {
					// eslint-disable-next-line no-console
					if (i % 5 === 0) console.log(`Waiting for server... attempt ${i + 1}/20`)
				}
				await new Promise((resolve) => setTimeout(resolve, 500))
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

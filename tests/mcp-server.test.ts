import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { toVFile } from "to-vfile"
import { matter } from "vfile-matter"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { buildDockerImage, dockerExec, dockerSpawn, startContainer, stopContainer } from "./utils/docker.js"

function parseFrontmatter(text: string): { frontmatter: Record<string, unknown>; body: string } {
	const file = toVFile({ value: text, path: "test.md" })
	matter(file, { strip: true })
	return {
		frontmatter: (file.data.matter as Record<string, unknown>) || {},
		body: String(file.value).trim()
	}
}

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
		// Check if the response has frontmatter (new format) or is plain markdown (old format)
		const hasFrontmatter = textContent.text.startsWith("---\n")
		if (hasFrontmatter) {
			const { frontmatter } = parseFrontmatter(textContent.text)
			expect(frontmatter.path).toBe("index.md")
		} else {
			// Fallback for old format (without frontmatter) - just check that content exists
			expect(textContent.text).toBeDefined()
			expect(textContent.text.length).toBeGreaterThan(0)
		}
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

	// Handle both new format (separate content items) and old format (combined)
	const paths: string[] = []
	for (const item of multiContent) {
		if (item.type === "text" && item.text) {
			const hasFrontmatter = item.text.startsWith("---\n")
			if (hasFrontmatter) {
				const { frontmatter } = parseFrontmatter(item.text)
				if (frontmatter.path) {
					paths.push(String(frontmatter.path))
				}
			} else {
				// Old format - check if content mentions both paths
				if (item.text.includes("index.md") || item.text.includes("overview")) {
					paths.push("index.md")
					paths.push("overview")
				}
			}
		}
	}
	// If we got separate items, verify both paths; otherwise just verify content exists
	if (multiContent.length >= 2) {
		expect(paths).toContain("index.md")
		expect(paths).toContain("overview")
	} else {
		// Old format - just verify we got some content
		expect(multiContent[0]?.text).toBeDefined()
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
		const { frontmatter, body } = parseFrontmatter(errorTextContent.text)
		expect(frontmatter.path).toBe("nonexistent-file.md")
		expect(frontmatter.error).toBeDefined()
		expect(String(frontmatter.error)).toContain("not found")
		expect(body).toContain("not found")
	}
}

describe("MCP Server Tests", () => {
	beforeAll(async () => {
		await buildDockerImage()
		await startContainer(STDIO_CONTAINER)

		// Start container - Docker image already has docs and config in /mcp-docs-server
		// Map port 8787 from container to host for wrangler dev
		// Cloudflare Worker is already pre-built in /tmp/cloudflare-build by Dockerfile
		await startContainer(REMOTE_CONTAINER, "8787:8787")
	}, 120000)

	afterAll(async () => {
		await stopContainer(STDIO_CONTAINER)
		await stopContainer(REMOTE_CONTAINER)
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
			// Step 1: Run wrangler dev inside Docker using detached mode
			// Use --local flag to use local runtime (miniflare)
			// Use --ip 0.0.0.0 to bind to all interfaces so it's accessible from outside the container
			// Use detached mode (-d flag) so wrangler runs independently and doesn't inherit Node.js process context
			const buildDir = "/tmp/cloudflare-build"
			console.info("Starting wrangler dev in container (detached mode)...")

			await dockerSpawn(
				`cd ${buildDir} && npx wrangler dev --local --port 8787 --ip 0.0.0.0 > /tmp/wrangler.log 2>&1`,
				REMOTE_CONTAINER,
				true // detached mode
			)

			// Give wrangler a moment to start
			await new Promise((resolve) => setTimeout(resolve, 3000))

			// Step 2: Wait for server to be ready
			let serverReady = false

			// Wait up to 30 seconds for server to respond
			for (let i = 0; i < 30; i++) {
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
					console.info(`✓ Server responded with status ${response.status} on attempt ${i + 1}`)
					// Give it a moment to fully initialize
					await new Promise((resolve) => setTimeout(resolve, 1000))
					serverReady = true
					break
				} catch (_error) {
					if (i % 5 === 0) console.info(`Waiting for server... attempt ${i + 1}/30`)
				}
				await new Promise((resolve) => setTimeout(resolve, 500))
			}

			if (!serverReady) {
				// Get wrangler log output
				let wranglerLogs = ""
				try {
					wranglerLogs = await dockerExec("cat /tmp/wrangler.log 2>/dev/null || echo 'Log file not found'", REMOTE_CONTAINER)
				} catch {
					wranglerLogs = "Failed to get wrangler log"
				}

				console.error("Wrangler dev output:", wranglerLogs)

				// Check if wrangler is actually running inside the container
				try {
					const psCheck = await dockerExec("ps aux | grep -E 'wrangler|workerd' | grep -v grep", REMOTE_CONTAINER)
					console.info("Wrangler processes in container:", psCheck || "none found")
				} catch {
					// Ignore
				}

				// Note: stopContainer in afterAll will handle cleanup
				throw new Error("Wrangler dev server did not start in time")
			}

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
			// Connect to wrangler dev instance running inside Docker (accessible via port mapping)
			const transport = new StreamableHTTPClientTransport(new URL("http://localhost:8787/mcp"))

			await client.connect(transport)
			await testMcpServer(client)
			await transport.close()
			// Note: stopContainer in afterAll will handle cleanup of the container and all processes
		}, 90000)
	})
})

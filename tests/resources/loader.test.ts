import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { resourcesDirectoryExists } from "../../src/handlers/resources.js"

describe("resources loader", () => {
	it("returns true when resources directory exists", async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-docs-server-test-"))
		await fs.mkdir(path.join(tempDir, "resources"), { recursive: true })

		const exists = await resourcesDirectoryExists(tempDir)
		expect(exists).toBe(true)

		await fs.rm(tempDir, { recursive: true, force: true })
	})

	it("returns false when resources directory does not exist", async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-docs-server-test-"))

		const exists = await resourcesDirectoryExists(tempDir)
		expect(exists).toBe(false)

		await fs.rm(tempDir, { recursive: true, force: true })
	})

	it("returns false when path does not exist", async () => {
		const nonExistentDir = path.join(os.tmpdir(), "non-existent-" + Date.now())

		const exists = await resourcesDirectoryExists(nonExistentDir)
		expect(exists).toBe(false)
	})
})

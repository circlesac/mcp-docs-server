import type { ChildProcess } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest"
import { publishDocs } from "../../src/commands/publish.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..", "..")
const configPath = path.join(repoRoot, "mcp-docs-server.json")

const { spawnMock } = vi.hoisted(() => {
	return {
		spawnMock: vi.fn((...args: unknown[]) => {
			void args
			return {
				on(event: string, handler: (...listenerArgs: unknown[]) => void) {
					if (event === "close") {
						process.nextTick(() => handler(0))
					}
					return this as unknown as ChildProcess
				}
			} as unknown as ChildProcess
		})
	}
})

vi.mock("node:child_process", () => ({
	spawn: (...args: Parameters<typeof spawnMock>) => spawnMock(...args)
}))

describe("publishDocs", () => {
	let writeFileSpy: MockInstance
	let consoleSpy: MockInstance

	beforeEach(() => {
		spawnMock.mockClear()
		writeFileSpy = vi.spyOn(fs, "writeFile")
		consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
	})

	afterEach(() => {
		writeFileSpy.mockRestore()
		consoleSpy.mockRestore()
	})

	it("packages docs and invokes npm publish", async () => {
		await publishDocs({ configPath })

		expect(spawnMock).toHaveBeenCalledTimes(1)
		expect(spawnMock.mock.calls[0]?.[0]).toBe("npm")
		expect(spawnMock.mock.calls[0]?.[1]).toEqual(["publish", "--access", "restricted"])

		const packageJsonWrite = writeFileSpy.mock.calls.find((call) => {
			const [filePath] = call as [string, unknown]
			return filePath.endsWith("package.json")
		})
		expect(packageJsonWrite).toBeDefined()
		const generatedPackageJson = JSON.parse(packageJsonWrite?.[1]?.toString() ?? "{}") as {
			name?: string
			files?: string[]
			dependencies?: Record<string, string>
			bin?: string
			description?: string
		}
		expect(generatedPackageJson.name).toBe("@circlesac/mcp-docs-server")
		expect(generatedPackageJson.files).toEqual(expect.arrayContaining(["bin", "docs", "mcp-docs-server.json"]))
		expect(generatedPackageJson.dependencies?.["@circlesac/mcp-docs-server"]).toBeDefined()
		expect(generatedPackageJson.bin).toBe("bin/stdio.js")

		const binWrite = writeFileSpy.mock.calls.find((call) => {
			const [filePath] = call as [string, unknown]
			return filePath.includes(path.join("bin", "stdio.js"))
		})
		expect(binWrite).toBeDefined()
		expect(binWrite?.[1]?.toString()).toContain("runServer")
	})

	it("stages package in output directory when requested", async () => {
		const outputDir = path.join(__dirname, "staged-package")

		try {
			await publishDocs({ configPath, outputDir })

			expect(spawnMock).not.toHaveBeenCalled()
			const stagedPackageJson = JSON.parse(await fs.readFile(path.join(outputDir, "package.json"), "utf-8")) as {
				name?: string
				files?: string[]
				dependencies?: Record<string, string>
				bin?: string
				description?: string
			}
			expect(stagedPackageJson.name).toBe("@circlesac/mcp-docs-server")
			expect(stagedPackageJson.files).toEqual(expect.arrayContaining(["bin", "docs", "mcp-docs-server.json"]))
			expect(stagedPackageJson.bin).toBe("bin/stdio.js")
			expect(stagedPackageJson.description).toBeUndefined()
		} finally {
			await fs.rm(outputDir, { recursive: true, force: true })
		}
	})
})

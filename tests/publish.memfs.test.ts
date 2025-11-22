import path from "node:path"
import { fileURLToPath } from "node:url"

import { createFsFromVolume, Volume } from "memfs"
import { describe, expect, it, vi } from "vitest"

import { fromPackageRoot } from "../src/utils.js"

type FsPromises = typeof import("node:fs/promises")

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe("publishDocs with in-memory filesystem", () => {
	it("writes expected package artifacts", async () => {
		const realFs = await import("node:fs/promises")

		const fixtureRoot = path.resolve(__dirname, "__fixtures__", "acme")
		const configContent = await realFs.readFile(path.join(fixtureRoot, "mcp-docs-server.json"), "utf-8")
		const docsIndex = await realFs.readFile(path.join(fixtureRoot, "docs", "index.md"), "utf-8")
		const templatePath = fromPackageRoot("templates", "docs.mdx")
		const templateContent = await realFs.readFile(templatePath, "utf-8")
		const packageJsonPath = fromPackageRoot("package.json")
		const packageJsonContent = await realFs.readFile(packageJsonPath, "utf-8")

		const volume = Volume.fromJSON(
			{
				"/acme/mcp-docs-server.json": configContent,
				"/acme/docs/index.md": docsIndex,
				"/package.json": packageJsonContent,
				"/templates/docs.mdx": templateContent
			},
			"/"
		)

		const memfs = createFsFromVolume(volume)
		const basePromises = memfs.promises

		const ensureDir: FsPromises["mkdir"] = async (dirPath, options) => {
			try {
				const opts = options && typeof options === "object" ? { recursive: true, ...options } : { recursive: true }
				await basePromises.mkdir(dirPath as string, opts)
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
					throw error
				}
			}
		}

		const cp: FsPromises["cp"] = async (src, dest, _options) => {
			const srcPath = typeof src === "string" ? src : src.toString()
			const destPath = typeof dest === "string" ? dest : dest.toString()
			const stats = await basePromises.stat(srcPath)
			if (stats.isDirectory()) {
				await ensureDir(destPath)
				const entries = await basePromises.readdir(srcPath, { withFileTypes: true })
				for (const entry of entries) {
					let entryName: string
					if (typeof entry === "string") {
						entryName = entry
					} else if ("name" in entry && typeof entry.name === "string") {
						entryName = entry.name
					} else {
						entryName = String(entry)
					}
					await cp(path.join(srcPath, entryName), path.join(destPath, entryName))
				}
			} else {
				const data = await basePromises.readFile(srcPath)
				await ensureDir(path.dirname(destPath))
				await basePromises.writeFile(destPath, data)
			}
		}

		const rm: FsPromises["rm"] = async (target, options) => {
			const targetPath = typeof target === "string" ? target : target.toString()
			try {
				const stats = await basePromises.stat(targetPath)
				if (stats.isDirectory()) {
					const entries = await basePromises.readdir(targetPath, { withFileTypes: true })
					for (const entry of entries) {
						let entryName: string
						if (typeof entry === "string") {
							entryName = entry
						} else if ("name" in entry && typeof entry.name === "string") {
							entryName = entry.name
						} else {
							entryName = String(entry)
						}
						await rm(path.join(targetPath, entryName), options)
					}
					await basePromises.rmdir(targetPath)
				} else {
					await basePromises.unlink(targetPath)
				}
			} catch (error) {
				if (!(options?.force && (error as NodeJS.ErrnoException).code === "ENOENT")) {
					throw error
				}
			}
		}

		const mkdtemp: FsPromises["mkdtemp"] = async (prefix, _options) => {
			const unique = `${prefix}${Math.random().toString(16).slice(2)}`
			await ensureDir(unique)
			// Type assertion needed because memfs mkdtemp returns string but FsPromises expects Buffer in some overloads
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return unique as any
		}

		const promises = Object.assign({}, basePromises, { cp, rm, mkdtemp, mkdir: ensureDir }) as unknown as FsPromises

		const spawnMock = vi.fn(() => ({
			on: (event: string, handler: (...listenerArgs: unknown[]) => void) => {
				if (event === "close") {
					handler(0)
				}
			}
		}))

		vi.doMock("node:fs/promises", () => ({ default: promises, ...promises }))
		vi.doMock("node:fs", () => ({ default: memfs, ...memfs }))
		vi.doMock("read-package-up", () => ({
			readPackageUp: async () => ({ path: "/package.json", packageJson: JSON.parse(packageJsonContent) }),
			readPackageUpSync: () => ({ path: "/package.json" })
		}))
		vi.doMock("node:child_process", () => ({ spawn: spawnMock }))

		const { publishDocs } = await import("../src/commands/publish.js")

		await publishDocs({ configPath: "/acme/mcp-docs-server.json", outputDir: "/acme-output" })

		expect(spawnMock).not.toHaveBeenCalled()

		const stagedPackageJson = JSON.parse(await promises.readFile("/acme-output/package.json", "utf-8")) as {
			bin?: string
			files?: string[]
		}
		expect(stagedPackageJson.bin).toBe("bin/stdio.js")
		expect(stagedPackageJson.files).toEqual(expect.arrayContaining(["bin", "docs", "mcp-docs-server.json"]))

		const stdioScript = await promises.readFile("/acme-output/bin/stdio.js", "utf-8")
		expect(stdioScript).toContain("runServer")

		vi.doUnmock("node:fs/promises")
		vi.doUnmock("node:child_process")
	})
})

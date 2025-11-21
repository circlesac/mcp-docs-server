import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"

import { clearConfigCache, getConfig, loadConfig } from "../config.js"
import { sanitizePackageDirName } from "../utils.js"

export interface CloudflareOptions {
	outputDir?: string
}

async function prepareBuildDirectory(outputDir?: string): Promise<string> {
	if (outputDir) {
		// Use provided output directory (override)
		const buildDir = path.resolve(outputDir)
		await fs.mkdir(buildDir, { recursive: true })
		return buildDir
	}

	// Default: Use .build/cloudflare/ in CWD
	const buildDir = path.resolve(process.cwd(), ".build", "cloudflare")
	await fs.mkdir(buildDir, { recursive: true })
	return buildDir
}

async function copyDocs(buildDir: string): Promise<void> {
	const config = getConfig()
	const targetDir = path.join(buildDir, config.docRoot.relativePath)
	await fs.mkdir(path.dirname(targetDir), { recursive: true })
	await fs.cp(config.docRoot.absolutePath, targetDir, { recursive: true, force: true })
}

async function copySourceFiles(buildDir: string): Promise<void> {
	// Copy all source files needed by cloudflare.ts
	const filesToCopy = ["config.ts", "logger.ts", "tools/docs.ts", "utils.ts"]

	for (const file of filesToCopy) {
		const sourcePath = path.resolve(process.cwd(), "src", file)
		const targetPath = path.join(buildDir, file)
		await fs.mkdir(path.dirname(targetPath), { recursive: true })
		await fs.cp(sourcePath, targetPath, { force: true })
	}
}

async function copyTemplates(buildDir: string): Promise<void> {
	// Copy templates directory so it's available in VFS at /bundle/templates/
	const sourcePath = path.resolve(process.cwd(), "templates")
	const targetPath = path.join(buildDir, "templates")
	await fs.cp(sourcePath, targetPath, { recursive: true, force: true })
}

interface DirMap {
	[dirPath: string]: {
		directories: string[]
		files: string[]
	}
}

async function generateReaddirMap(buildDir: string): Promise<void> {
	const config = getConfig()
	const docsDir = path.join(buildDir, config.docRoot.relativePath)
	const dirMap: DirMap = {}

	async function scanDirectory(dirPath: string, relativePath: string): Promise<void> {
		const entries = await fs.readdir(dirPath, { withFileTypes: true })
		const directories: string[] = []
		const files: string[] = []

		for (const entry of entries) {
			if (entry.isDirectory()) {
				directories.push(entry.name)
				const subDirPath = path.join(dirPath, entry.name)
				const subRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name
				await scanDirectory(subDirPath, subRelativePath)
			} else if (entry.isFile() && /\.mdx?$/i.test(entry.name)) {
				files.push(entry.name)
			}
		}

		directories.sort((a, b) => a.localeCompare(b))
		files.sort((a, b) => a.localeCompare(b))

		const mapKey = relativePath || config.docRoot.relativePath
		dirMap[mapKey] = { directories, files }
	}

	await scanDirectory(docsDir, config.docRoot.relativePath)

	const readdirMapPath = path.join(buildDir, "readdir.json")
	await fs.writeFile(readdirMapPath, `${JSON.stringify(dirMap, null, 2)}\n`)
}

async function copyCloudflareEntrypoint(buildDir: string): Promise<void> {
	const sourcePath = path.resolve(process.cwd(), "src", "cloudflare.ts")
	const targetPath = path.join(buildDir, "index.ts")
	await fs.cp(sourcePath, targetPath, { force: true })
}

async function generateWranglerConfig(buildDir: string): Promise<void> {
	const config = getConfig()
	const workerName = sanitizePackageDirName(config.packageName)

	// Read package.json for version
	const packageJsonPath = path.resolve(process.cwd(), "package.json")
	let version = config.version
	try {
		const pkgJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8")) as { version?: string }
		version = pkgJson.version ?? config.version
	} catch {
		// Fallback to config version
	}

	const wranglerConfig = {
		name: workerName,
		main: "./index.ts",
		compatibility_date: "2025-09-01",
		compatibility_flags: ["nodejs_compat"],
		vars: {
			MCP_DOCS_SERVER_NAME: config.name,
			MCP_DOCS_SERVER_VERSION: version,
			MCP_DOCS_SERVER_TOOL_NAME: config.tool,
			MCP_DOCS_SERVER_DOCS_PATH: config.docRoot.relativePath,
			MCP_DOCS_SERVER_PACKAGE_NAME: config.packageName
		},
		rules: [
			{
				type: "Text",
				globs: ["**/*.md", "**/*.mdx", "readdir.json", "mcp-docs-server.json"],
				fallthrough: true
			}
		]
	}

	await fs.writeFile(path.join(buildDir, "wrangler.json"), `${JSON.stringify(wranglerConfig, null, 2)}\n`)
}

async function runWranglerBuild(buildDir: string): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = spawn("npx", ["wrangler", "build"], {
			cwd: buildDir,
			stdio: "inherit",
			shell: true
		})

		child.on("error", reject)
		child.on("close", (code) => {
			if (code === 0) {
				resolve()
			} else {
				reject(new Error(`wrangler build exited with code ${code}`))
			}
		})
	})
}

export async function handleCloudflare(options: CloudflareOptions = {}): Promise<void> {
	await loadConfig()
	const buildDir = await prepareBuildDirectory(options.outputDir)

	try {
		// Clean up existing directory if it exists
		await fs.rm(buildDir, { recursive: true, force: true })
		await fs.mkdir(buildDir, { recursive: true })

		// Copy user's docs
		await copyDocs(buildDir)

		// Generate readdir.json map for VFS directory listing
		await generateReaddirMap(buildDir)

		// Copy config file for VFS access (even though we use env vars, it's useful to have it bundled)
		const configPath = path.resolve(process.cwd(), "mcp-docs-server.json")
		try {
			await fs.cp(configPath, path.join(buildDir, "mcp-docs-server.json"), { force: true })
		} catch {
			// Config file might not exist, that's okay
		}

		// Copy templates directory for VFS access
		await copyTemplates(buildDir)

		// Copy source files needed by cloudflare.ts
		await copySourceFiles(buildDir)

		// Copy cloudflare.ts entrypoint as index.ts
		await copyCloudflareEntrypoint(buildDir)

		// Generate wrangler.json with worker name
		await generateWranglerConfig(buildDir)

		// Run wrangler build
		console.info("Building Cloudflare Worker...")
		await runWranglerBuild(buildDir)
		console.info(`Cloudflare build complete at ${buildDir}`)
	} finally {
		clearConfigCache()
	}
}

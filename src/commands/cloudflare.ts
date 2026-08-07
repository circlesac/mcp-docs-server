import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { readPackageUp, readPackageUpSync } from "read-package-up"
import { promptsDirectoryExists } from "../handlers/prompts.js"
import { resourcesDirectoryExists } from "../handlers/resources.js"
import type { DocsServerConfig } from "../utils/config.js"
import { CONFIG_FILENAME, loadConfig } from "../utils/config.js"
import { sanitizePackageDirName } from "../utils/index.js"

export interface CloudflareOptions {
	configPath?: string
	docs?: string
	outputDir?: string
	dryRun?: boolean
	accountId?: string
}

export async function handleCloudflare(options: CloudflareOptions = {}): Promise<void> {
	// Resolve configPath: process.cwd() + mcp-docs-server.json unless provided
	const configPath = options.configPath
		? path.isAbsolute(options.configPath)
			? options.configPath
			: path.resolve(process.cwd(), options.configPath)
		: path.join(process.cwd(), CONFIG_FILENAME)

	// Find templatePath from npm package using read-package-up
	const moduleDir = path.dirname(fileURLToPath(import.meta.url))
	const packageRootResult = readPackageUpSync({ cwd: moduleDir })
	if (!packageRootResult?.path) {
		throw new Error("package.json not found. This indicates a packaging error.")
	}
	const packageRoot = path.dirname(packageRootResult.path)
	const templatePath = path.join(packageRoot, "templates", "docs.mdx")

	const config = loadConfig({ configPath, templatePath, docs: options.docs })
	const buildDir = await prepareBuildDirectory(config, options.outputDir)

	// Always clean the target directory before building
	await fs.rm(buildDir, { recursive: true, force: true })
	await fs.mkdir(buildDir, { recursive: true })

	// Copy user's docs
	await copyDocs(config, buildDir)

	// Copy prompts directory if it exists
	await copyPrompts(config, buildDir)

	// Copy resources directory if it exists
	await copyResources(config, buildDir)

	// Copy config file (use the resolved configPath from above)
	await fs.cp(configPath, path.join(buildDir, "mcp-docs-server.json"), { force: true })

	// Copy templates directory
	await copyTemplates(packageRoot, buildDir)

	// Copy source files needed by cloudflare.ts
	await copySourceFiles(packageRoot, buildDir)

	// Copy cloudflare.ts entrypoint as index.ts
	await copyCloudflareEntrypoint(packageRoot, buildDir)

	// Generate package.json for the build directory
	await generatePackageJson(buildDir)

	// Generate wrangler.json with worker name
	await generateWranglerConfig(config, buildDir, options.accountId)

	// Install dependencies
	console.info("Installing dependencies...")
	await runNpmInstall(buildDir)

	// Generate TypeScript types
	console.info("Generating TypeScript types...")
	await runWranglerTypes(buildDir)

	if (options.dryRun) {
		console.info(`Dry run complete. Build directory prepared at ${buildDir}`)
		return
	}

	// Deploy to Cloudflare
	console.info("Deploying Cloudflare Worker...")
	await runWranglerDeploy(buildDir)
	console.info(`Cloudflare deployment complete`)
}

async function prepareBuildDirectory(config: DocsServerConfig, outputDir?: string): Promise<string> {
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

async function copyDocs(config: DocsServerConfig, buildDir: string): Promise<void> {
	const targetDir = path.join(buildDir, config.docRoot.relativePath)
	await fs.mkdir(path.dirname(targetDir), { recursive: true })
	await fs.cp(config.docRoot.absolutePath, targetDir, { recursive: true, force: true })
}

async function copySourceFiles(packageRoot: string, buildDir: string): Promise<void> {
	// Copy tools directory
	const toolsSourcePath = path.join(packageRoot, "src", "tools")
	const toolsTargetPath = path.join(buildDir, "src", "tools")
	await fs.mkdir(path.dirname(toolsTargetPath), { recursive: true })
	await fs.cp(toolsSourcePath, toolsTargetPath, { recursive: true, force: true })

	// Copy utils directory (contains config.ts, logger.ts, index.ts)
	const utilsSourcePath = path.join(packageRoot, "src", "utils")
	const utilsTargetPath = path.join(buildDir, "src", "utils")
	await fs.mkdir(path.dirname(utilsTargetPath), { recursive: true })
	await fs.cp(utilsSourcePath, utilsTargetPath, { recursive: true, force: true })

	// Copy handlers directory (contains prompts.ts, tools.ts, resources.ts)
	const handlersSourcePath = path.join(packageRoot, "src", "handlers")
	const handlersTargetPath = path.join(buildDir, "src", "handlers")
	try {
		await fs.access(handlersSourcePath)
		await fs.cp(handlersSourcePath, handlersTargetPath, { recursive: true, force: true })
	} catch {
		// Handlers directory doesn't exist in source, skip
	}
}

async function copyPrompts(config: DocsServerConfig, buildDir: string): Promise<void> {
	if (await promptsDirectoryExists(config.rootDir)) {
		const sourcePath = path.join(config.rootDir, "prompts")
		const targetPath = path.join(buildDir, "prompts")
		await fs.cp(sourcePath, targetPath, { recursive: true, force: true })
	}
}

async function copyResources(config: DocsServerConfig, buildDir: string): Promise<void> {
	if (await resourcesDirectoryExists(config.rootDir)) {
		const sourcePath = path.join(config.rootDir, "resources")
		const targetPath = path.join(buildDir, "resources")
		await fs.cp(sourcePath, targetPath, { recursive: true, force: true })
	}
}

async function copyTemplates(packageRoot: string, buildDir: string): Promise<void> {
	// Copy templates directory
	const sourcePath = path.join(packageRoot, "templates")
	const targetPath = path.join(buildDir, "templates")
	await fs.cp(sourcePath, targetPath, { recursive: true, force: true })
}

async function copyCloudflareEntrypoint(packageRoot: string, buildDir: string): Promise<void> {
	const sourcePath = path.join(packageRoot, "src", "cloudflare.ts")
	const targetPath = path.join(buildDir, "src", "index.ts")
	await fs.mkdir(path.dirname(targetPath), { recursive: true })
	await fs.cp(sourcePath, targetPath, { force: true })
}

async function generatePackageJson(buildDir: string): Promise<void> {
	// Read root package.json to get dependencies for npm install (relative to this module's location)
	const moduleDir = path.dirname(fileURLToPath(import.meta.url))
	const result = await readPackageUp({ cwd: moduleDir })
	if (!result?.packageJson) {
		throw new Error("package.json not found. This indicates a packaging error.")
	}

	const dependencies = (result.packageJson.dependencies as Record<string, string>) || {}

	// Generate minimal package.json for Cloudflare Worker build
	// Only include what's needed for npm install
	const buildPackageJson = {
		type: "module",
		dependencies
	}

	await fs.writeFile(path.join(buildDir, "package.json"), `${JSON.stringify(buildPackageJson, null, 2)}\n`)
}

async function generateWranglerConfig(config: DocsServerConfig, buildDir: string, accountId?: string): Promise<void> {
	const workerName = sanitizePackageDirName(config.packageName)

	// Read root wrangler.json as template (relative to this module's location)
	const moduleDir = path.dirname(fileURLToPath(import.meta.url))
	const packageRootResult = await readPackageUp({ cwd: moduleDir })
	if (!packageRootResult?.path) {
		throw new Error("package.json not found. This indicates a packaging error.")
	}
	const packageRoot = path.dirname(packageRootResult.path)
	const rootWranglerPath = path.join(packageRoot, "wrangler.json")
	const content = await fs.readFile(rootWranglerPath, "utf-8")
	const rootWranglerConfig = JSON.parse(content) as Record<string, unknown>

	// Merge root config with build-specific overrides
	const wranglerConfig = {
		...rootWranglerConfig,
		name: workerName,
		main: "./src/index.ts",
		...(accountId && { account_id: accountId })
	}

	await fs.writeFile(path.join(buildDir, "wrangler.json"), `${JSON.stringify(wranglerConfig, null, 2)}\n`)
}

async function runNpmInstall(buildDir: string): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = spawn("npm", ["install"], {
			cwd: buildDir,
			stdio: "inherit",
			shell: true
		})

		child.on("error", reject)
		child.on("close", (code) => {
			if (code === 0) {
				resolve()
			} else {
				reject(new Error(`npm install exited with code ${code}`))
			}
		})
	})
}

async function runWranglerTypes(buildDir: string): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = spawn("npx", ["wrangler", "types"], {
			cwd: buildDir,
			stdio: "inherit",
			shell: true
		})

		child.on("error", reject)
		child.on("close", (code) => {
			if (code === 0) {
				resolve()
			} else {
				reject(new Error(`wrangler types exited with code ${code}`))
			}
		})
	})
}

async function runWranglerDeploy(buildDir: string): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = spawn("npx", ["wrangler", "deploy"], {
			cwd: buildDir,
			stdio: "inherit",
			shell: true
		})

		child.on("error", reject)
		child.on("close", (code) => {
			if (code === 0) {
				resolve()
			} else {
				reject(new Error(`wrangler deploy exited with code ${code}`))
			}
		})
	})
}

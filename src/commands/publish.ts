import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { readPackageUpSync } from "read-package-up"
import { promptsDirectoryExists } from "../handlers/prompts.js"
import { resourcesDirectoryExists } from "../handlers/resources.js"
import type { DocsServerConfig } from "../utils/config.js"
import { CONFIG_FILENAME, loadConfig } from "../utils/config.js"
import { sanitizePackageDirName } from "../utils/index.js"

const SCRIPT_BASENAME = "stdio.js"

export interface PublishOptions {
	configPath?: string
	docs?: string
	outputDir?: string
}

// Export publishDocs for backward compatibility (used by tests and bin script)
export async function publishDocs(options: PublishOptions = {}): Promise<void> {
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
	const packageDir = await preparePackageDirectory(config, options.outputDir)

	// Always clean the target directory before building
	await fs.rm(packageDir, { recursive: true, force: true })
	await fs.mkdir(packageDir, { recursive: true })

	await copyDocRoots(config, packageDir)
	await copyPrompts(config, packageDir)
	await copyResources(config, packageDir)
	await copyConfigFile(config, packageDir)
	await copyNpmrcIfPresent(config, packageDir)
	await writeBinScript(config, packageDir)
	await writePackageJson(config, packageDir)

	if (options.outputDir) {
		// If outputDir was explicitly provided, just report the location (staging mode)
		console.info(`Staged package at ${packageDir}`)
	} else {
		// Default behavior: publish to npm
		console.info(`Publishing ${config.packageName}@${config.version}...`)
		await publishWithNpm(packageDir)
		console.info("Publish complete")
	}
}

async function preparePackageDirectory(config: DocsServerConfig, outputDir?: string): Promise<string> {
	const safeDirName = sanitizePackageDirName(config.packageName)

	if (outputDir) {
		// Use provided output directory (override)
		const packageDir = path.resolve(outputDir)
		await fs.mkdir(packageDir, { recursive: true })
		return packageDir
	}

	// Default: Use .build/npm/ in CWD
	const packageDir = path.resolve(process.cwd(), ".build", "npm", safeDirName)
	await fs.mkdir(packageDir, { recursive: true })
	return packageDir
}

async function copyDocRoots(config: DocsServerConfig, destination: string): Promise<void> {
	const targetDir = path.join(destination, config.docRoot.relativePath)
	await fs.mkdir(path.dirname(targetDir), { recursive: true })
	await fs.cp(config.docRoot.absolutePath, targetDir, { recursive: true, force: true })
}

async function copyPrompts(config: DocsServerConfig, destination: string): Promise<void> {
	if (await promptsDirectoryExists(config.rootDir)) {
		const sourcePath = path.join(config.rootDir, "prompts")
		const targetPath = path.join(destination, "prompts")
		await fs.cp(sourcePath, targetPath, { recursive: true, force: true })
	}
}

async function copyResources(config: DocsServerConfig, destination: string): Promise<void> {
	if (await resourcesDirectoryExists(config.rootDir)) {
		const sourcePath = path.join(config.rootDir, "resources")
		const targetPath = path.join(destination, "resources")
		await fs.cp(sourcePath, targetPath, { recursive: true, force: true })
	}
}

async function copyConfigFile(config: DocsServerConfig, destination: string): Promise<void> {
	await fs.copyFile(config.configPath, path.join(destination, path.basename(config.configPath)))
}

async function copyNpmrcIfPresent(config: DocsServerConfig, destination: string): Promise<void> {
	const source = path.join(config.rootDir, ".npmrc")
	try {
		const stat = await fs.stat(source)
		if (stat.isFile()) {
			await fs.copyFile(source, path.join(destination, ".npmrc"))
		}
	} catch {
		// ignore missing .npmrc
	}
}

async function writeBinScript(config: DocsServerConfig, destination: string): Promise<void> {
	const binDir = path.join(destination, "bin")
	await fs.mkdir(binDir, { recursive: true })

	const scriptPath = path.join(binDir, SCRIPT_BASENAME)
	const contents = `#!/usr/bin/env node
import path from "node:path"
import { fileURLToPath } from "node:url"
import { runServer } from "@circlesac/mcp-docs-server"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const configPath = path.resolve(__dirname, "..", "${path.basename(config.configPath)}")

await runServer({ configPath })
`

	await fs.writeFile(scriptPath, contents, { mode: 0o755 })
}

async function writePackageJson(config: DocsServerConfig, destination: string): Promise<void> {
	const files = new Set<string>(["bin", path.basename(config.configPath), config.docRoot.relativePath])
	// Add prompts directory if it exists
	if (await promptsDirectoryExists(config.rootDir)) {
		files.add("prompts")
	}
	// Add resources directory if it exists
	if (await resourcesDirectoryExists(config.rootDir)) {
		files.add("resources")
	}

	const pkgJson = {
		name: config.packageName,
		version: config.version,
		type: "module" as const,
		bin: `bin/${SCRIPT_BASENAME}`,
		files: Array.from(files),
		dependencies: {
			"@circlesac/mcp-docs-server": "latest"
		},
		engines: {
			node: ">=18"
		},
		publishConfig: {
			access: "restricted"
		}
	}

	await fs.writeFile(
		path.join(destination, "package.json"),
		`${JSON.stringify(pkgJson, null, 2)}
`
	)
}

async function publishWithNpm(packageDir: string): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = spawn("npm", ["publish", "--access", "restricted"], {
			cwd: packageDir,
			stdio: "inherit"
		})

		child.on("error", reject)
		child.on("close", (code) => {
			if (code === 0) {
				resolve()
			} else {
				reject(new Error(`npm publish exited with code ${code}`))
			}
		})
	})
}

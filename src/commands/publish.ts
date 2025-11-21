import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"

import { clearConfigCache, getConfig, loadConfig } from "../config.js"
import { fromPackageRoot, getPackageRoot, sanitizePackageDirName } from "../utils.js"

const SCRIPT_BASENAME = "stdio.js"

export interface PublishOptions {
	configPath?: string
	cwd?: string
	outputDir?: string
}

async function readPackageVersion(): Promise<string> {
	const json = JSON.parse(await fs.readFile(fromPackageRoot(getPackageRoot(), "package.json"), "utf-8")) as { version?: string }
	return json.version ?? "0.0.0"
}

async function copyDocRoots(destination: string): Promise<void> {
	const config = getConfig()
	const targetDir = path.join(destination, config.docRoot.relativePath)
	await fs.mkdir(path.dirname(targetDir), { recursive: true })
	await fs.cp(config.docRoot.absolutePath, targetDir, { recursive: true, force: true })
}

async function writePackageJson(destination: string, runtimeVersion: string): Promise<void> {
	const config = getConfig()
	const files = new Set<string>(["bin", path.basename(config.configPath), config.docRoot.relativePath])

	const pkgJson = {
		name: config.packageName,
		version: config.version,
		type: "module" as const,
		bin: `bin/${SCRIPT_BASENAME}`,
		files: Array.from(files),
		dependencies: {
			"@circlesac/mcp-docs-server": `^${runtimeVersion}`
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

async function writeBinScript(destination: string): Promise<void> {
	const config = getConfig()
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

async function copyConfigFile(destination: string): Promise<void> {
	const config = getConfig()
	await fs.copyFile(config.configPath, path.join(destination, path.basename(config.configPath)))
}

async function copyNpmrcIfPresent(destination: string): Promise<void> {
	const config = getConfig()
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

async function preparePackageDirectory(outputDir?: string): Promise<string> {
	const config = getConfig()
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

// Export publishDocs for backward compatibility (used by tests and bin script)
export async function publishDocs(options: PublishOptions = {}): Promise<void> {
	await loadConfig(options)
	const runtimeVersion = await readPackageVersion()
	const packageDir = await preparePackageDirectory(options.outputDir)

	try {
		// Clean up existing directory if it exists
		await fs.rm(packageDir, { recursive: true, force: true })
		await fs.mkdir(packageDir, { recursive: true })

		await copyDocRoots(packageDir)
		await copyConfigFile(packageDir)
		await copyNpmrcIfPresent(packageDir)
		await writeBinScript(packageDir)
		await writePackageJson(packageDir, runtimeVersion)

		if (options.outputDir) {
			// If outputDir was explicitly provided, just report the location (staging mode)
			console.info(`Staged package at ${packageDir}`)
		} else {
			// Default behavior: publish to npm
			console.info(`Publishing ${getConfig().packageName}@${getConfig().version}...`)
			await publishWithNpm(packageDir)
			console.info("Publish complete")
		}
	} finally {
		clearConfigCache()
	}
}

export async function handlePublish(options: PublishOptions = {}): Promise<void> {
	await publishDocs(options)
}

import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { clearConfigCache, getConfig, loadConfig } from "./config.js"
import { fromPackageRoot } from "./utils.js"

const SCRIPT_BASENAME = "stdio.js"

function sanitizePackageDirName(packageName: string): string {
	return packageName.replace(/[^a-zA-Z0-9.-]+/g, "-") || "docs"
}

async function readPackageVersion(): Promise<string> {
	const json = JSON.parse(await fs.readFile(fromPackageRoot("package.json"), "utf-8")) as { version?: string }
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

async function preparePackageDirectory(): Promise<string> {
	const config = getConfig()
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-docs-"))
	const safeDirName = sanitizePackageDirName(config.packageName)
	const packageDir = path.join(tempRoot, safeDirName)
	await fs.mkdir(packageDir, { recursive: true })
	return packageDir
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
	} catch (_err) {
		// ignore missing .npmrc
	}
}

async function cleanup(directory: string): Promise<void> {
	await fs.rm(directory, { recursive: true, force: true })
}

export interface PublishOptions {
	configPath?: string
	cwd?: string
	outputDir?: string
}

export async function publishDocs(options: PublishOptions = {}): Promise<string | void> {
	await loadConfig(options)
	const runtimeVersion = await readPackageVersion()
	const packageDir = await preparePackageDirectory()
	const tempRoot = path.dirname(packageDir)

	try {
		await copyDocRoots(packageDir)
		await copyConfigFile(packageDir)
		await copyNpmrcIfPresent(packageDir)
		await writeBinScript(packageDir)
		await writePackageJson(packageDir, runtimeVersion)

		if (options.outputDir) {
			const destination = path.resolve(options.outputDir)
			await fs.rm(destination, { recursive: true, force: true })
			await fs.mkdir(path.dirname(destination), { recursive: true })
			await fs.cp(packageDir, destination, { recursive: true, force: true })
			console.info(`Staged package at ${destination}`)
			return destination
		}

		console.info(`Publishing ${getConfig().packageName}@${getConfig().version}...`)
		await publishWithNpm(packageDir)
		console.info("Publish complete")
	} finally {
		await cleanup(tempRoot)
		clearConfigCache()
	}
}

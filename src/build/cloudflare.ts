import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"

import { clearConfigCache, getConfig, loadConfig } from "../config.js"
import { sanitizePackageDirName } from "../utils.js"

export interface CloudflareBuildOptions {
	configPath?: string
	cwd?: string
	outputDir?: string
}

async function prepareBuildDirectory(outputDir?: string): Promise<string> {
	const config = getConfig()
	const safeDirName = sanitizePackageDirName(config.packageName)
	
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

async function copyAndAdaptDocsTool(buildDir: string): Promise<void> {
	const config = getConfig()
	const sourcePath = path.resolve(process.cwd(), "src", "tools", "docs.ts")
	const targetDir = path.join(buildDir, "tools")
	const targetPath = path.join(targetDir, "docs.ts")
	
	await fs.mkdir(targetDir, { recursive: true })
	
	// Read the source file
	const sourceContent = await fs.readFile(sourcePath, "utf-8")
	
	// Adapt for VFS: replace absolute path usage with VFS paths
	// VFS base path is /bundle/{docRoot.relativePath}/
	const vfsBase = `/bundle/${config.docRoot.relativePath}`
	
	// Replace docRoot.absolutePath with VFS path builder
	// We need to replace:
	// - root.absolutePath -> vfsPath(relativePath)
	// - config.docRoot.absolutePath -> vfsBase
	// - docRoot.absolutePath -> vfsBase
	// And update resolveDocPath to build VFS paths
	
	const adaptedContent = sourceContent
		// Add VFS helper function at the top
		.replace(
			/import type { DocRoot } from "\.\.\/config\.js"/,
			`import type { DocRoot } from "../config.js"

// VFS helper: convert relative path to VFS path
function vfsPath(relativePath: string): string {
	const config = getConfig()
	const base = \`/bundle/\${config.docRoot.relativePath}\`
	if (relativePath === ".") {
		return base
	}
	return \`\${base}/\${relativePath.replace(/^\\//, "")}\`
}`
		)
		// Replace resolveDocPath to use VFS paths
		.replace(
			/const target = relativePath === "\." \? root\.absolutePath : path\.resolve\(root\.absolutePath, relativePath\)/g,
			`const target = relativePath === "." ? vfsPath(".") : vfsPath(relativePath)`
		)
		.replace(
			/if \(!target\.startsWith\(root\.absolutePath\)\) \{/g,
			`if (!target.startsWith(\`/bundle/\${root.relativePath}\`)) {`
		)
		// Replace other absolutePath usages
		.replace(/docRoot\.absolutePath/g, `vfsPath(".")`)
		.replace(/config\.docRoot\.absolutePath/g, `vfsPath(".")`)
		.replace(/root\.absolutePath/g, `vfsPath(".")`)
		.replace(/resolved\.absolutePath/g, `resolved.absolutePath`) // Keep this as is, it's already resolved
	
	await fs.writeFile(targetPath, adaptedContent)
}

async function generateWranglerConfig(buildDir: string): Promise<void> {
	const config = getConfig()
	const workerName = sanitizePackageDirName(config.packageName)
	
	const wranglerConfig = {
		name: workerName,
		main: "./index.ts",
		compatibility_date: "2024-01-01",
		compatibility_flags: ["nodejs_compat"],
		rules: [
			{
				type: "Text",
				globs: ["**/*.md", "**/*.mdx"],
				fallthrough: true
			}
		]
	}
	
	await fs.writeFile(
		path.join(buildDir, "wrangler.json"),
		`${JSON.stringify(wranglerConfig, null, 2)}\n`
	)
}

async function generateWorkerEntrypoint(buildDir: string): Promise<void> {
	const config = getConfig()
	const docRoot = config.docRoot.relativePath
	
	const entrypointContent = `import { createDocsTool } from "./tools/docs.js"

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// TODO: Implement MCP JSON-RPC handler
		// TODO: Use createDocsTool() from adapted tools/docs.ts
		return new Response("Not implemented yet", { status: 501 })
	}
}

interface Env {
	// Add environment variables if needed
}

interface ExecutionContext {
	waitUntil(promise: Promise<unknown>): void
	passThroughOnException(): void
}
`
	
	await fs.writeFile(
		path.join(buildDir, "index.ts"),
		entrypointContent
	)
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

export async function buildCloudflare(options: CloudflareBuildOptions = {}): Promise<string> {
	await loadConfig(options)
	const buildDir = await prepareBuildDirectory(options.outputDir)

	try {
		// Clean up existing directory if it exists
		await fs.rm(buildDir, { recursive: true, force: true })
		await fs.mkdir(buildDir, { recursive: true })
		
		// Copy user's docs
		await copyDocs(buildDir)
		
		// Copy and adapt docs.ts for VFS
		await copyAndAdaptDocsTool(buildDir)
		
		// Generate wrangler.json
		await generateWranglerConfig(buildDir)
		
		// Generate Worker entrypoint
		await generateWorkerEntrypoint(buildDir)
		
		// Run wrangler build
		console.info("Building Cloudflare Worker...")
		await runWranglerBuild(buildDir)
		console.info(`Cloudflare build complete at ${buildDir}`)
		
		return buildDir
	} finally {
		clearConfigCache()
	}
}


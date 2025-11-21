#!/usr/bin/env bun

import fs from "node:fs/promises"
import path from "node:path"
import { getConfig, loadConfig } from "../src/config.js"

interface DirMap {
	[dirPath: string]: {
		directories: string[]
		files: string[]
	}
}

async function generateReaddirMap(): Promise<void> {
	await loadConfig()
	const config = getConfig()
	const docsDir = path.resolve(process.cwd(), config.docRoot.relativePath)
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

	const readdirMapPath = path.join(process.cwd(), "readdir.json")
	await fs.writeFile(readdirMapPath, `${JSON.stringify(dirMap, null, 2)}\n`)
	console.info(`Generated readdir.json at ${readdirMapPath}`)
}

generateReaddirMap().catch((error) => {
	console.error("Failed to generate readdir.json:", error)
	process.exit(1)
})

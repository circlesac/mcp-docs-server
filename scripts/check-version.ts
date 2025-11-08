#!/usr/bin/env bun
import { readFile } from "node:fs/promises"

const readJson = async (p: string) => JSON.parse(await readFile(p, "utf8"))
const { version: pv } = await readJson("package.json")
const { version: cv } = await readJson("mcp-docs-server.json")
if (!pv || !cv || pv !== cv) {
	console.error(`Version mismatch: package.json=${pv ?? ""} vs mcp-docs-server.json=${cv ?? ""}`)
	process.exit(1)
}

#!/usr/bin/env bun
import { readFile } from "node:fs/promises"

const readJson = async (p: string) => JSON.parse(await readFile(p, "utf8"))
const { version: pv } = await readJson("package.json")
const { version: cv } = await readJson("mcp-docs-server.json")
const wranglerConfig = await readJson("wrangler.json")
const wv = wranglerConfig?.vars?.MCP_DOCS_SERVER_VERSION

if (!pv || !cv || pv !== cv) {
	console.error(`Version mismatch: package.json=${pv ?? ""} vs mcp-docs-server.json=${cv ?? ""}`)
	process.exit(1)
}

if (!wv || pv !== wv) {
	console.error(`Version mismatch: package.json=${pv ?? ""} vs wrangler.json vars.MCP_DOCS_SERVER_VERSION=${wv ?? ""}`)
	process.exit(1)
}

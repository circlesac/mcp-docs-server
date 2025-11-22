import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { buildDockerImage, dockerExec, startContainer, stopContainer } from "../utils/docker.js"

const REMOTE_CONTAINER = "mcp-docs-server-cloudflare-test"

describe("Cloudflare command tests", () => {
	beforeAll(async () => {
		await buildDockerImage()
		await startContainer(REMOTE_CONTAINER)
	}, 120000)

	afterAll(async () => {
		await stopContainer(REMOTE_CONTAINER)
	}, 30000)

	it("should have the package installed", async () => {
		const result = await dockerExec("cd /acme-docs && npx @circlesac/mcp-docs-server --help", REMOTE_CONTAINER)
		expect(result).toContain("Usage:")
		expect(result).toContain("serve")
		expect(result).toContain("publish")
		expect(result).toContain("cloudflare")
	})

	it("should build Cloudflare Worker and run wrangler types", async () => {
		// Run cloudflare command with dry-run
		await dockerExec("cd /acme-docs && npx @circlesac/mcp-docs-server cloudflare --dry-run", REMOTE_CONTAINER)

		// Install dependencies
		await dockerExec("cd /acme-docs/.build/cloudflare && npm install", REMOTE_CONTAINER)

		// Run wrangler types to generate worker-configuration.d.ts
		await dockerExec("cd /acme-docs/.build/cloudflare && npx wrangler types", REMOTE_CONTAINER)

		// Verify types file was generated
		const typesCheck = await dockerExec("test -f /acme-docs/.build/cloudflare/worker-configuration.d.ts && echo 'exists' || echo 'missing'", REMOTE_CONTAINER)
		expect(typesCheck.trim()).toBe("exists")

		// Verify wrangler.json exists
		const wranglerCheck = await dockerExec("test -f /acme-docs/.build/cloudflare/wrangler.json && echo 'exists' || echo 'missing'", REMOTE_CONTAINER)
		expect(wranglerCheck.trim()).toBe("exists")

		// Verify source files are copied
		const srcCheck = await dockerExec("test -d /acme-docs/.build/cloudflare/src && echo 'exists' || echo 'missing'", REMOTE_CONTAINER)
		expect(srcCheck.trim()).toBe("exists")
	}, 60000)
})

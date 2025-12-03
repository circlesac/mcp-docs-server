import { exec, spawn } from "node:child_process"
import path from "node:path"
import { promisify } from "node:util"

const execAsync = promisify(exec)

const DOCKER_IMAGE = "mcp-docs-server"

export async function dockerExec(command: string, containerName: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const proc = spawn("docker", ["exec", containerName, "sh", "-c", command], {
			stdio: ["pipe", "pipe", "pipe"]
		})

		let stdout = ""
		let stderr = ""

		proc.stdout.on("data", (data) => {
			stdout += data.toString()
		})

		proc.stderr.on("data", (data) => {
			stderr += data.toString()
		})

		proc.on("close", (code, signal) => {
			// Combine stdout and stderr since some commands output to stderr (like logger output)
			const output = stdout + stderr

			// Check if command failed (non-zero exit code)
			if (code !== 0) {
				// Exit code 137 = SIGKILL (128 + 9), usually means process was killed (OOM, timeout, etc.)
				if (code === 137 || signal === "SIGKILL") {
					const errorMsg = `Process was killed (exit code ${code}${signal ? `, signal ${signal}` : ""}). This usually indicates out-of-memory or timeout.`
					const outputMsg = output ? `\nOutput:\n${output}` : "\nNo output captured."
					reject(new Error(`Docker exec failed: ${errorMsg}${outputMsg}\nCommand: ${command}`))
					return
				}

				// Check if this is just npm warnings (which are informational, not errors)
				// npm warnings like "npm warn exec The following package was not found..." shouldn't fail
				const hasNpmWarnings = stderr.includes("npm warn") && !stderr.includes("npm ERR!")
				const hasActualErrors = stderr.includes("npm ERR!") || stderr.includes("Error:") || stdout.includes("Error:")

				// If it's just npm warnings and no actual errors, treat as success
				if (hasNpmWarnings && !hasActualErrors) {
					resolve(output)
					return
				}

				const errorDetails = stderr || stdout || "No output captured"
				reject(new Error(`Docker exec failed with exit code ${code}${signal ? ` (signal: ${signal})` : ""}:\n${errorDetails}\nCommand: ${command}`))
				return
			}

			resolve(output)
		})

		proc.on("error", (error) => {
			reject(new Error(`Docker exec spawn failed: ${error.message}`))
		})
	})
}

export async function dockerSpawn(command: string, containerName: string, detached = false): Promise<{ process: ReturnType<typeof spawn>; output: Promise<string> }> {
	return new Promise((resolve) => {
		// Use -d flag for detached mode (e.g., for wrangler dev that needs to run independently)
		// Without -d, the process is attached to Node.js and may inherit environment/context issues
		const execArgs = detached ? ["exec", "-d", containerName, "sh", "-c", command] : ["exec", containerName, "sh", "-c", command]

		const proc = spawn("docker", execArgs, {
			stdio: detached ? ["ignore", "ignore", "ignore"] : ["ignore", "pipe", "pipe"]
		})

		if (detached) {
			// For detached mode, we can't capture output, so return empty output promise
			const outputPromise = Promise.resolve("")
			resolve({ process: proc, output: outputPromise })
			return
		}

		let output = ""
		if (proc.stdout) {
			proc.stdout.on("data", (data) => {
				output += data.toString()
			})
		}
		if (proc.stderr) {
			proc.stderr.on("data", (data) => {
				output += data.toString()
			})
		}

		const outputPromise = new Promise<string>((resolveOutput) => {
			proc.on("close", () => {
				resolveOutput(output)
			})
		})

		resolve({ process: proc, output: outputPromise })
	})
}

export async function buildDockerImage(): Promise<void> {
	const repoRoot = path.resolve(__dirname, "..", "..")

	// Remove existing image to force rebuild
	try {
		await execAsync(`docker rmi ${DOCKER_IMAGE} 2>/dev/null || true`)
		console.info("Removed existing Docker image")
	} catch {
		// Image might not exist, that's fine
	}

	try {
		console.info("Building Docker image...")
		const { stderr } = await execAsync(`docker build -t ${DOCKER_IMAGE} .`, { cwd: repoRoot })
		if (stderr && !stderr.toString().includes("WARNING")) {
			console.warn(`Docker build stderr: ${stderr}`)
		}
		console.info("Docker image built successfully")
	} catch (error: unknown) {
		const err = error as { stdout?: string; stderr?: string }
		throw new Error(`Docker build failed: ${err.stderr || err.stdout || String(error)}`)
	}
}

export async function startContainer(containerName: string, portMapping?: string, volumeMount?: { hostPath: string; containerPath: string }): Promise<void> {
	// Stop and remove existing container if it exists
	try {
		await execAsync(`docker stop ${containerName} 2>/dev/null || true`)
	} catch {
		// Ignore errors
	}
	try {
		await execAsync(`docker rm ${containerName} 2>/dev/null || true`)
	} catch {
		// Ignore errors
	}
	// Wait a bit for Docker to fully clean up
	await new Promise((resolve) => setTimeout(resolve, 500))

	// Start container in detached mode
	const portFlag = portMapping ? `-p ${portMapping}` : ""
	const volumeFlag = volumeMount ? `-v ${path.resolve(volumeMount.hostPath)}:${volumeMount.containerPath}` : ""
	try {
		const { stderr } = await execAsync(`docker run -d ${portFlag} ${volumeFlag} --name ${containerName} ${DOCKER_IMAGE} tail -f /dev/null`)
		if (stderr && !stderr.toString().includes("WARNING")) {
			console.warn(`Docker run stderr: ${stderr}`)
		}
		console.info(`Docker container ${containerName} started`)
	} catch (error: unknown) {
		const err = error as { stdout?: string; stderr?: string }
		throw new Error(`Docker run failed: ${err.stderr || err.stdout || String(error)}`)
	}
}

export async function stopContainer(containerName: string): Promise<void> {
	await execAsync(`docker stop ${containerName} 2>/dev/null || true`).catch(() => {})
	await execAsync(`docker rm ${containerName} 2>/dev/null || true`).catch(() => {})
	console.info(`Docker container ${containerName} stopped and removed`)
}

/**
 * Spawn a local process (not in Docker) and return the process and output promise.
 */
export async function localSpawn(
	command: string,
	cwd: string,
	options?: { env?: Record<string, string> }
): Promise<{ process: ReturnType<typeof spawn>; output: Promise<string> }> {
	return new Promise((resolve) => {
		// Parse command properly - handle quoted arguments
		const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g) || []
		const cmd = parts[0]?.replace(/^"|"$/g, "") || ""
		const args = parts.slice(1).map((arg) => arg.replace(/^"|"$/g, ""))

		const proc = spawn(cmd, args, {
			cwd,
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env, ...options?.env },
			shell: true
		})

		let output = ""
		proc.stdout.on("data", (data) => {
			output += data.toString()
		})
		proc.stderr.on("data", (data) => {
			output += data.toString()
		})

		const outputPromise = new Promise<string>((resolveOutput) => {
			proc.on("close", () => {
				resolveOutput(output)
			})
		})

		resolve({ process: proc, output: outputPromise })
	})
}

/**
 * Kill any process using the specified port
 */
export async function killProcessOnPort(port: number): Promise<void> {
	try {
		// Use lsof to find process using the port (works on macOS and Linux)
		const { stdout } = await execAsync(`lsof -ti:${port}`)
		const pids = stdout
			.trim()
			.split("\n")
			.filter((pid) => pid.length > 0)

		if (pids.length > 0) {
			console.info(`Killing processes on port ${port}: ${pids.join(", ")}`)
			// Kill all processes using this port
			for (const pid of pids) {
				try {
					await execAsync(`kill -9 ${pid}`)
				} catch {
					// Process may have already terminated, ignore
				}
			}
			// Give processes time to terminate
			await new Promise((resolve) => setTimeout(resolve, 500))
		}
	} catch {
		// No process using the port, which is fine
	}
}

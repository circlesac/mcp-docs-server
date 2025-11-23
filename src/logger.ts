import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { LoggingLevel } from "@modelcontextprotocol/sdk/types.js"

export interface Logger {
	debug: (message: string, data?: unknown) => Promise<void>
	info: (message: string, data?: unknown) => Promise<void>
	notice: (message: string, data?: unknown) => Promise<void>
	warning: (message: string, data?: unknown) => Promise<void>
	error: (message: string, error?: unknown) => Promise<void>
	critical: (message: string, error?: unknown) => Promise<void>
	alert: (message: string, error?: unknown) => Promise<void>
	emergency: (message: string, error?: unknown) => Promise<void>
}

function asObject(data?: unknown) {
	if (!data) return undefined
	if (data instanceof Error) {
		return {
			message: data.message,
			name: data.name,
			stack: data.stack
		}
	}
	return typeof data === "object" ? data : { data }
}

function fallbackLog(level: LoggingLevel, message: string, data?: unknown) {
	const logPayload = asObject(data)
	const line = `[${level.toUpperCase()}] ${message}`
	if (logPayload) {
		console.error(line, logPayload)
	} else {
		console.error(line)
	}
}

export function createLogger(server?: McpServer): Logger {
	const sendLog = async (level: LoggingLevel, message: string, data?: unknown) => {
		if (!server) {
			fallbackLog(level, message, data)
			return
		}

		try {
			await server.sendLoggingMessage({
				level,
				data: {
					message,
					...asObject(data)
				}
			})
		} catch (error) {
			fallbackLog(level, message, error)
		}
	}

	const wrap = (level: LoggingLevel) => async (message: string, data?: unknown) => {
		await sendLog(level, message, data)
	}

	return {
		debug: wrap("debug"),
		info: wrap("info"),
		notice: wrap("notice"),
		warning: wrap("warning"),
		error: wrap("error"),
		critical: wrap("critical"),
		alert: wrap("alert"),
		emergency: wrap("emergency")
	}
}

export const logger = createLogger()

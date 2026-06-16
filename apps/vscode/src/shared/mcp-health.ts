/**
 * MCP connection health classification (QAM-499).
 *
 * The raw `McpServer.status` is `connected | connecting | disconnected`. For the
 * agent panel we want a finer, user-facing health that distinguishes an
 * **authentication** failure from being **offline**:
 *
 *  - The bundled Fenneq server (QAM-497) is gated by a workspace Bearer key. Until
 *    QAM-498 provisions that key, connecting returns 401 ("missing bearer") — that's
 *    an *auth-error*, and the panel should prompt the user to sign in, not just say
 *    "disconnected, retry".
 *  - A truly unreachable server (network down, wrong URL) is *offline* — retry is
 *    the right call-to-action.
 *
 * Lives in `@shared` so both the extension host and the webview can classify
 * identically.
 */
import type { McpServer } from "./mcp"

export type McpConnectionHealth = "connected" | "connecting" | "auth-error" | "offline" | "error"

/** Substrings indicating the failure was authentication / authorization. */
const AUTH_HINTS = [
	"missing bearer",
	"invalid bearer",
	"unauthorized",
	"unauthenticated",
	"authentication",
	"forbidden",
	"401",
	"403",
]

/** Substrings indicating the server is unreachable (network / offline). */
const OFFLINE_HINTS = [
	"econnrefused",
	"enotfound",
	"econnreset",
	"etimedout",
	"network",
	"fetch failed",
	"socket hang up",
	"getaddrinfo",
	"connection refused",
]

function matches(haystack: string, needles: string[]): boolean {
	const s = haystack.toLowerCase()
	return needles.some((n) => s.includes(n))
}

/** Classify a server's connection health from its status + error message. */
export function classifyMcpServerHealth(server: Pick<McpServer, "status" | "error">): McpConnectionHealth {
	if (server.status === "connected") {
		return "connected"
	}
	if (server.status === "connecting") {
		return "connecting"
	}
	// disconnected — refine by the error message, if any.
	const err = server.error ?? ""
	if (matches(err, AUTH_HINTS)) {
		return "auth-error"
	}
	if (matches(err, OFFLINE_HINTS)) {
		return "offline"
	}
	return "error"
}

export interface McpHealthSummary {
	/** Short label for the status chip. */
	label: string
	/** True when the problem is authentication (→ show a sign-in affordance). */
	isAuthError: boolean
}

export function mcpHealthSummary(health: McpConnectionHealth): McpHealthSummary {
	switch (health) {
		case "connected":
			return { label: "Connected", isAuthError: false }
		case "connecting":
			return { label: "Connecting…", isAuthError: false }
		case "auth-error":
			return { label: "Authentication required", isAuthError: true }
		case "offline":
			return { label: "Offline", isAuthError: false }
		default:
			return { label: "Connection error", isAuthError: false }
	}
}

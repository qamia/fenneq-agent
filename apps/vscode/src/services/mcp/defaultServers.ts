/**
 * Default bundled MCP servers (QAM-497).
 *
 * Qortex ships with the **Fenneq MCP preconfigured** so every user is auto-connected
 * to their Supabase-backed knowledge server with no manual setup. v1 uses the remote
 * **Streamable-HTTP** transport (cloud-only) — there is no local Python runtime to
 * bundle into the editor.
 *
 * Per-user authentication (QAM-498) layers on top: once the user's Supabase session
 * yields a token, it is injected as a Bearer header via {@link withFenneqAuth}. Until
 * then the server is *configured but unauthenticated*, a state the connection-health
 * UI (QAM-499) surfaces to the user.
 *
 * The seed is written only when the MCP settings file is first created (fresh install);
 * existing users' settings are never overwritten.
 */

export const FENNEQ_SERVER_NAME = "fenneq"

/**
 * The hosted Fenneq MCP endpoint. Overridable (staging / self-host) via the
 * `FENNEQ_MCP_URL` env var at build/runtime; defaults to the production endpoint.
 */
export const FENNEQ_MCP_URL = process.env.FENNEQ_MCP_URL?.trim() || "https://mcp.fenneq.qamia.dev"

/**
 * A remote (Streamable-HTTP) MCP server entry. `type` MUST be set explicitly:
 * the settings schema's union resolves an absent `type` to `sse`, not streamableHttp.
 */
export interface RemoteMcpServerConfig {
	type: "streamableHttp"
	url: string
	headers?: Record<string, string>
}

/**
 * Build the default Fenneq server entry. The per-user Bearer header is included
 * only when a token is supplied (QAM-498); otherwise the entry is configured but
 * unauthenticated.
 */
export function buildFenneqServerEntry(authToken?: string): RemoteMcpServerConfig {
	const entry: RemoteMcpServerConfig = {
		type: "streamableHttp",
		url: FENNEQ_MCP_URL,
	}
	if (authToken) {
		entry.headers = { Authorization: `Bearer ${authToken}` }
	}
	return entry
}

/** The `mcpServers` map seeded into a fresh settings file. */
export function defaultMcpServers(authToken?: string): Record<string, RemoteMcpServerConfig> {
	return { [FENNEQ_SERVER_NAME]: buildFenneqServerEntry(authToken) }
}

/** Full settings-file contents for a fresh install. */
export function defaultMcpSettings(authToken?: string): { mcpServers: Record<string, RemoteMcpServerConfig> } {
	return { mcpServers: defaultMcpServers(authToken) }
}

/**
 * QAM-498 seam: inject / refresh the per-user Bearer token on the Fenneq entry,
 * returning a new settings object (immutable). No-op if the Fenneq server is absent
 * (e.g. a user who deliberately removed it).
 */
export function withFenneqAuth<T extends { mcpServers: Record<string, any> }>(settings: T, authToken: string): T {
	const server = settings.mcpServers?.[FENNEQ_SERVER_NAME]
	if (!server) {
		return settings
	}
	return {
		...settings,
		mcpServers: {
			...settings.mcpServers,
			[FENNEQ_SERVER_NAME]: {
				...server,
				headers: { ...(server.headers ?? {}), Authorization: `Bearer ${authToken}` },
			},
		},
	}
}

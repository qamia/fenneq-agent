/**
 * Default bundled MCP servers (QAM-497).
 *
 * Qortex ships with the **Fenneq MCP preconfigured** so every user is auto-connected
 * to their Supabase-backed knowledge server with no manual setup.
 *
 * Transport: the Fenneq MCP server (a FastMCP app, `qamia/FenneQ`) exposes an
 * **SSE** endpoint at `/mcp` over HTTP (`fenneq.mcp.transport_http`, run via
 * `scripts/run_http.py`, default port 8765). Every request except `/healthz` is
 * gated by `WorkspaceAuthMiddleware`, which resolves an `Authorization: Bearer
 * <workspace-api-key>` to a workspace (`fenneq.auth.api_keys.verify_key`). So the
 * agent connects as an `sse` server and authenticates with a workspace API key.
 *
 * Per-user authentication (QAM-498): the workspace API key is injected as the
 * Bearer header via {@link withFenneqAuth}. The *server side already exists* (the
 * api_keys table + verify_key); QAM-498's remaining work is to obtain the user's
 * workspace key and inject it here. Until then the server is *configured but
 * unauthenticated*, a state the connection-health UI (QAM-499) surfaces.
 *
 * The seed is written only when the MCP settings file is first created (fresh
 * install); existing users' settings are never overwritten.
 */

export const FENNEQ_SERVER_NAME = "fenneq";

/**
 * Explicit deployment URL for a hosted Fenneq MCP server — UNSET by default.
 * BYOK builds ship no knowledge server, and the old `http://127.0.0.1:8765/mcp`
 * fallback seeded every fresh install with a dead "fenneq — offline" entry in
 * the MCP view. Set `FENNEQ_MCP_URL` (e.g. in a managed/team build) to restore
 * automatic seeding against a real deployment.
 */
export const FENNEQ_MCP_URL = process.env.FENNEQ_MCP_URL?.trim() || "";

/**
 * A Fenneq MCP server entry (SSE transport). `type` MUST be set explicitly: the
 * settings schema's union resolves an absent `type` to `sse` — which happens to be
 * what we want, but we set it to avoid relying on union ordering.
 */
export interface FenneqMcpServerConfig {
	type: "sse";
	url: string;
	headers?: Record<string, string>;
}

/**
 * Build the default Fenneq server entry. The workspace-key Bearer header is
 * included only when a key is supplied (QAM-498); otherwise the entry is
 * configured but unauthenticated.
 */
export function buildFenneqServerEntry(
	authToken?: string,
	url: string = FENNEQ_MCP_URL,
): FenneqMcpServerConfig {
	const entry: FenneqMcpServerConfig = {
		type: "sse",
		url,
	};
	if (authToken) {
		entry.headers = { Authorization: `Bearer ${authToken}` };
	}
	return entry;
}

/**
 * The `mcpServers` map seeded into a fresh settings file. Seeds the Fenneq
 * server ONLY when a deployment URL is explicitly configured — otherwise a
 * fresh install gets a clean, empty server list.
 */
export function defaultMcpServers(
	authToken?: string,
): Record<string, FenneqMcpServerConfig> {
	if (!FENNEQ_MCP_URL) {
		return {};
	}
	return { [FENNEQ_SERVER_NAME]: buildFenneqServerEntry(authToken) };
}

/** Full settings-file contents for a fresh install. */
export function defaultMcpSettings(authToken?: string): {
	mcpServers: Record<string, FenneqMcpServerConfig>;
} {
	return { mcpServers: defaultMcpServers(authToken) };
}

/**
 * QAM-498 seam: inject / refresh the per-user workspace API key as the Bearer
 * header on the Fenneq entry, returning a new settings object (immutable). No-op if
 * the Fenneq server is absent (e.g. a user who deliberately removed it).
 */
export function withFenneqAuth<T extends { mcpServers: Record<string, any> }>(
	settings: T,
	authToken: string,
): T {
	const server = settings.mcpServers?.[FENNEQ_SERVER_NAME];
	if (!server) {
		return settings;
	}
	return {
		...settings,
		mcpServers: {
			...settings.mcpServers,
			[FENNEQ_SERVER_NAME]: {
				...server,
				headers: {
					...(server.headers ?? {}),
					Authorization: `Bearer ${authToken}`,
				},
			},
		},
	};
}

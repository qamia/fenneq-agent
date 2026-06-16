/**
 * Per-user authentication for the bundled Fenneq MCP server (QAM-498).
 *
 * The Fenneq MCP server gates every request on a **workspace-scoped API key**
 * (`Authorization: Bearer <key>` → `verify_key` → `workspace_id`, against the
 * Supabase `api_keys` table). This module obtains the user's key and injects it
 * into the bundled `fenneq` server entry (via {@link withFenneqAuth}, QAM-497) so
 * the server connects **authenticated, scoped to that user's workspace** — the
 * server enforces data isolation.
 *
 * v1 source: the `FENNEQ_WORKSPACE_KEY` environment variable. This is the seam a
 * future sign-in / key-provisioning UI replaces — swap {@link getFenneqWorkspaceKey}
 * to read from the agent's secret storage / a Supabase session. When no key is set,
 * the server stays *configured-but-unauthenticated* (QAM-499 surfaces that, and the
 * server returns 401 "missing bearer").
 */
import fs from "fs/promises"
import { fileExistsAtPath } from "@utils/fs"
import { FENNEQ_SERVER_NAME, withFenneqAuth } from "./defaultServers"

/** The user's Fenneq workspace API key, or undefined when not configured. */
export function getFenneqWorkspaceKey(): string | undefined {
	const key = process.env.FENNEQ_WORKSPACE_KEY?.trim()
	return key || undefined
}

/**
 * Inject the workspace key into the MCP settings file's `fenneq` server so it
 * connects authenticated. Reads → applies `withFenneqAuth` → writes back, but only
 * if the header actually changed (idempotent). Returns true when it updated the
 * file. Never throws on a missing/absent/unparseable file or absent server — those
 * are no-ops returning false.
 */
export async function applyFenneqWorkspaceAuth(settingsFilePath: string, key: string | undefined): Promise<boolean> {
	if (!key) {
		return false
	}
	if (!(await fileExistsAtPath(settingsFilePath))) {
		return false
	}
	let parsed: { mcpServers?: Record<string, any> }
	try {
		parsed = JSON.parse(await fs.readFile(settingsFilePath, "utf-8"))
	} catch {
		return false
	}
	const server = parsed?.mcpServers?.[FENNEQ_SERVER_NAME]
	if (!server) {
		return false
	}
	if (server.headers?.Authorization === `Bearer ${key}`) {
		return false // already applied
	}
	const updated = withFenneqAuth(parsed as { mcpServers: Record<string, any> }, key)
	await fs.writeFile(settingsFilePath, JSON.stringify(updated, null, 2))
	return true
}

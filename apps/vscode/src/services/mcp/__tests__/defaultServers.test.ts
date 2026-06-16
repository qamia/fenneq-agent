import { describe, it } from "mocha"
import "should"
import {
	buildFenneqServerEntry,
	defaultMcpServers,
	defaultMcpSettings,
	FENNEQ_MCP_URL,
	FENNEQ_SERVER_NAME,
	withFenneqAuth,
} from "../defaultServers"
import { McpSettingsSchema } from "../schemas"

describe("defaultServers (QAM-497 — bundled Fenneq MCP)", () => {
	it("builds an sse entry with no auth header by default", () => {
		const entry = buildFenneqServerEntry()
		entry.type.should.equal("sse")
		entry.url.should.equal(FENNEQ_MCP_URL)
		;(entry.headers === undefined).should.be.true()
	})

	it("includes a per-user Bearer header when a token is supplied (QAM-498)", () => {
		const entry = buildFenneqServerEntry("tok-123")
		entry.headers!.Authorization.should.equal("Bearer tok-123")
	})

	it("seeds the settings file with exactly one 'fenneq' server", () => {
		Object.keys(defaultMcpSettings().mcpServers).should.deepEqual([FENNEQ_SERVER_NAME])
		Object.keys(defaultMcpServers()).should.deepEqual([FENNEQ_SERVER_NAME])
	})

	it("the seeded default is VALID per the MCP settings schema and resolves to sse", () => {
		// The Fenneq server speaks SSE (FastMCP sse_app at /mcp); confirm the seed
		// is schema-valid and resolves to the sse transport.
		const parsed = McpSettingsSchema.parse(defaultMcpSettings())
		parsed.mcpServers[FENNEQ_SERVER_NAME].type.should.equal("sse")
	})

	it("a token-bearing default also validates and keeps the header", () => {
		const parsed = McpSettingsSchema.parse(defaultMcpSettings("tok-xyz"))
		const fenneq = parsed.mcpServers[FENNEQ_SERVER_NAME] as { type: string; headers?: Record<string, string> }
		fenneq.type.should.equal("sse")
		fenneq.headers!.Authorization.should.equal("Bearer tok-xyz")
	})

	it("withFenneqAuth injects the token immutably and preserves other fields", () => {
		const before = defaultMcpSettings()
		const after = withFenneqAuth(before, "tok-abc")
		// original untouched (immutability)
		;(before.mcpServers[FENNEQ_SERVER_NAME].headers === undefined).should.be.true()
		// new object carries the per-user Bearer header
		after.mcpServers[FENNEQ_SERVER_NAME].headers!.Authorization.should.equal("Bearer tok-abc")
		after.mcpServers[FENNEQ_SERVER_NAME].url.should.equal(FENNEQ_MCP_URL)
	})

	it("withFenneqAuth refreshes an existing token rather than duplicating headers", () => {
		const seeded = withFenneqAuth(defaultMcpSettings(), "old")
		const refreshed = withFenneqAuth(seeded, "new")
		refreshed.mcpServers[FENNEQ_SERVER_NAME].headers!.Authorization.should.equal("Bearer new")
	})

	it("withFenneqAuth is a no-op when the user removed the fenneq server", () => {
		const settings = { mcpServers: {} as Record<string, unknown> }
		withFenneqAuth(settings, "tok").should.equal(settings)
	})
})

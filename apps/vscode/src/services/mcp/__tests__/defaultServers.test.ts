import { describe, it } from "mocha";
import "should";
import {
	buildFenneqServerEntry,
	defaultMcpServers,
	defaultMcpSettings,
	FENNEQ_SERVER_NAME,
	withFenneqAuth,
} from "../defaultServers";
import { McpSettingsSchema } from "../schemas";

// A stand-in hosted deployment URL: seeding is gated on FENNEQ_MCP_URL being
// configured, which it is NOT in the test environment.
const DEPLOYMENT_URL = "https://mcp.example.test/mcp";

function settingsWithFenneq(authToken?: string) {
	return {
		mcpServers: {
			[FENNEQ_SERVER_NAME]: buildFenneqServerEntry(authToken, DEPLOYMENT_URL),
		},
	};
}

describe("defaultServers (QAM-497 — bundled Fenneq MCP)", () => {
	it("builds an sse entry with no auth header by default", () => {
		const entry = buildFenneqServerEntry(undefined, DEPLOYMENT_URL);
		entry.type.should.equal("sse");
		entry.url.should.equal(DEPLOYMENT_URL);
		(entry.headers === undefined).should.be.true();
	});

	it("includes a per-user Bearer header when a token is supplied (QAM-498)", () => {
		const entry = buildFenneqServerEntry("tok-123", DEPLOYMENT_URL);
		entry.headers!.Authorization.should.equal("Bearer tok-123");
	});

	it("seeds NO servers when no deployment URL is configured (BYOK default)", () => {
		// The old localhost:8765 fallback gave every fresh install a dead
		// "fenneq — offline" entry; without FENNEQ_MCP_URL nothing is seeded.
		Object.keys(defaultMcpSettings().mcpServers).should.deepEqual([]);
		Object.keys(defaultMcpServers()).should.deepEqual([]);
	});

	it("a deployment-configured entry is VALID per the MCP settings schema and resolves to sse", () => {
		const parsed = McpSettingsSchema.parse(settingsWithFenneq());
		parsed.mcpServers[FENNEQ_SERVER_NAME].type.should.equal("sse");
	});

	it("a token-bearing entry also validates and keeps the header", () => {
		const parsed = McpSettingsSchema.parse(settingsWithFenneq("tok-xyz"));
		const fenneq = parsed.mcpServers[FENNEQ_SERVER_NAME] as {
			type: string;
			headers?: Record<string, string>;
		};
		fenneq.type.should.equal("sse");
		fenneq.headers!.Authorization.should.equal("Bearer tok-xyz");
	});

	it("withFenneqAuth injects the token immutably and preserves other fields", () => {
		const before = settingsWithFenneq();
		const after = withFenneqAuth(before, "tok-abc");
		// original untouched (immutability)
		(
			before.mcpServers[FENNEQ_SERVER_NAME].headers === undefined
		).should.be.true();
		// new object carries the per-user Bearer header
		after.mcpServers[FENNEQ_SERVER_NAME].headers!.Authorization.should.equal(
			"Bearer tok-abc",
		);
		after.mcpServers[FENNEQ_SERVER_NAME].url.should.equal(DEPLOYMENT_URL);
	});

	it("withFenneqAuth refreshes an existing token rather than duplicating headers", () => {
		const seeded = withFenneqAuth(settingsWithFenneq(), "old");
		const refreshed = withFenneqAuth(seeded, "new");
		refreshed.mcpServers[
			FENNEQ_SERVER_NAME
		].headers!.Authorization.should.equal("Bearer new");
	});

	it("withFenneqAuth is a no-op when the fenneq server is absent", () => {
		const settings = { mcpServers: {} as Record<string, unknown> };
		withFenneqAuth(settings, "tok").should.equal(settings);
	});
});

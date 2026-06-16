import { describe, it } from "mocha"
import "should"
import { classifyMcpServerHealth, mcpHealthSummary } from "@shared/mcp-health"

describe("mcp-health (QAM-499 — connection health classification)", () => {
	it("maps connected / connecting straight through", () => {
		classifyMcpServerHealth({ status: "connected" }).should.equal("connected")
		classifyMcpServerHealth({ status: "connecting" }).should.equal("connecting")
	})

	it("classifies a 401 / bearer failure as auth-error (the bundled Fenneq server, no key yet)", () => {
		// WorkspaceAuthMiddleware returns {"error":"missing bearer"} / "invalid bearer".
		classifyMcpServerHealth({ status: "disconnected", error: '{"error":"missing bearer"}' }).should.equal("auth-error")
		classifyMcpServerHealth({ status: "disconnected", error: "invalid bearer" }).should.equal("auth-error")
		classifyMcpServerHealth({ status: "disconnected", error: "HTTP 401 Unauthorized" }).should.equal("auth-error")
		classifyMcpServerHealth({ status: "disconnected", error: "403 Forbidden" }).should.equal("auth-error")
	})

	it("classifies network failures as offline", () => {
		classifyMcpServerHealth({ status: "disconnected", error: "connect ECONNREFUSED 127.0.0.1:8765" }).should.equal(
			"offline",
		)
		classifyMcpServerHealth({ status: "disconnected", error: "fetch failed" }).should.equal("offline")
		classifyMcpServerHealth({ status: "disconnected", error: "getaddrinfo ENOTFOUND mcp.fenneq.qamia.dev" }).should.equal(
			"offline",
		)
	})

	it("falls back to a generic error for unrecognized disconnect reasons", () => {
		classifyMcpServerHealth({ status: "disconnected", error: "something weird happened" }).should.equal("error")
		classifyMcpServerHealth({ status: "disconnected" }).should.equal("error")
	})

	it("auth detection is case-insensitive", () => {
		classifyMcpServerHealth({ status: "disconnected", error: "MISSING BEARER" }).should.equal("auth-error")
	})

	it("summary flags auth-error for the sign-in affordance", () => {
		mcpHealthSummary("auth-error").isAuthError.should.be.true()
		mcpHealthSummary("auth-error").label.should.equal("Authentication required")
		mcpHealthSummary("connected").isAuthError.should.be.false()
		mcpHealthSummary("offline").label.should.equal("Offline")
	})
})

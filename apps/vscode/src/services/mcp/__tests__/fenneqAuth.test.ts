import fs from "fs/promises"
import os from "os"
import path from "path"
import { afterEach, beforeEach, describe, it } from "mocha"
import "should"
import { defaultMcpSettings } from "../defaultServers"
import { applyFenneqWorkspaceAuth, getFenneqWorkspaceKey } from "../fenneqAuth"

describe("fenneqAuth (QAM-498 — per-user workspace auth)", () => {
	let dir: string
	let file: string

	beforeEach(async () => {
		dir = await fs.mkdtemp(path.join(os.tmpdir(), "fenneq-auth-"))
		file = path.join(dir, "cline_mcp_settings.json")
	})

	afterEach(async () => {
		await fs.rm(dir, { recursive: true, force: true })
	})

	async function seedDefault(): Promise<void> {
		await fs.writeFile(file, JSON.stringify(defaultMcpSettings(), null, 2))
	}

	async function readFenneq(): Promise<any> {
		return JSON.parse(await fs.readFile(file, "utf-8")).mcpServers.fenneq
	}

	it("injects the workspace key as a Bearer header on the fenneq server", async () => {
		await seedDefault()
		const changed = await applyFenneqWorkspaceAuth(file, "ws-key-123")
		changed.should.be.true()
		;(await readFenneq()).headers.Authorization.should.equal("Bearer ws-key-123")
	})

	it("is idempotent — a second apply with the same key is a no-op", async () => {
		await seedDefault()
		;(await applyFenneqWorkspaceAuth(file, "ws-key-123")).should.be.true()
		;(await applyFenneqWorkspaceAuth(file, "ws-key-123")).should.be.false()
	})

	it("rotates the key when a new one is supplied", async () => {
		await seedDefault()
		await applyFenneqWorkspaceAuth(file, "old")
		;(await applyFenneqWorkspaceAuth(file, "new")).should.be.true()
		;(await readFenneq()).headers.Authorization.should.equal("Bearer new")
	})

	it("is a no-op when no key is supplied", async () => {
		await seedDefault()
		;(await applyFenneqWorkspaceAuth(file, undefined)).should.be.false()
		;(((await readFenneq()).headers === undefined)).should.be.true()
	})

	it("is a no-op when the settings file is missing", async () => {
		;(await applyFenneqWorkspaceAuth(file, "ws-key-123")).should.be.false()
	})

	it("is a no-op when the fenneq server was removed", async () => {
		await fs.writeFile(file, JSON.stringify({ mcpServers: {} }, null, 2))
		;(await applyFenneqWorkspaceAuth(file, "ws-key-123")).should.be.false()
	})

	it("does not throw on an unparseable settings file", async () => {
		await fs.writeFile(file, "{ not json")
		;(await applyFenneqWorkspaceAuth(file, "ws-key-123")).should.be.false()
	})

	it("getFenneqWorkspaceKey reads FENNEQ_WORKSPACE_KEY (trimmed), undefined when unset", () => {
		const prev = process.env.FENNEQ_WORKSPACE_KEY
		try {
			process.env.FENNEQ_WORKSPACE_KEY = "  ws-abc  "
			;(getFenneqWorkspaceKey() as string).should.equal("ws-abc")
			delete process.env.FENNEQ_WORKSPACE_KEY
			;(getFenneqWorkspaceKey() === undefined).should.be.true()
		} finally {
			if (prev === undefined) {
				delete process.env.FENNEQ_WORKSPACE_KEY
			} else {
				process.env.FENNEQ_WORKSPACE_KEY = prev
			}
		}
	})
})

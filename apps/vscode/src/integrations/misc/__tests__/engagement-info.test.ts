import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import { readEngagementInfo } from "../engagement-info";

describe("readEngagementInfo", () => {
	let dir: string;

	before(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "engagement-info-"));
		fs.writeFileSync(
			path.join(dir, "engagement.md"),
			[
				"---",
				"engagement_id: 4bed993e-cad4-4f5b-96eb-20dc3d38abc7",
				"client: Sharjah Airport",
				"title: Morning-bank stands",
				"status: solved",
				"opened: 2026-07-30",
				"---",
				"",
				"# Morning-bank stands",
			].join("\n"),
			"utf-8",
		);
		fs.writeFileSync(
			path.join(dir, "decisions.md"),
			[
				"# Decisions — Morning-bank stands",
				"",
				"## 2026-07-30 — EK203 contact rule is HARD",
				"detail",
				"",
				"## 2026-07-30 — TK762 may be bussed (SOFT)",
				"detail",
			].join("\n"),
			"utf-8",
		);
		fs.mkdirSync(path.join(dir, "reports"));
		fs.writeFileSync(path.join(dir, "reports", "allocation_report.html"), "x");
		fs.mkdirSync(path.join(dir, "data"));
	});

	after(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("reads manifest, decisions and artifacts", async () => {
		const info = await readEngagementInfo(dir);
		expect(info.exists).to.equal(true);
		expect(info.client).to.equal("Sharjah Airport");
		expect(info.status).to.equal("solved");
		expect(info.decisionCount).to.equal(2);
		expect(info.recentDecisions[1]).to.include("TK762");
		expect(info.reportFiles).to.deep.equal(["allocation_report.html"]);
		expect(info.modelCount).to.equal(0);
		expect(info.dataCount).to.equal(0);
	});

	it("returns exists=false without a manifest", async () => {
		const info = await readEngagementInfo(os.tmpdir());
		expect(info.exists).to.equal(false);
	});
});

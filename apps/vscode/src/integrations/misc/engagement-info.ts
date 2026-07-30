import fs from "node:fs/promises";
import path from "node:path";

/**
 * File-backed engagement reader for the welcome-screen engagement card.
 * Mirrors the fenneq MCP server's engagement layout: an `engagement.md`
 * manifest with `key: value` frontmatter, an append-only `decisions.md`
 * (one `## ` heading per decision), and data/ models/ reports/ folders.
 * Read-only — the MCP tools own all writes.
 */

export interface EngagementInfoData {
	exists: boolean;
	engagementId: string;
	client: string;
	title: string;
	status: string;
	opened: string;
	decisionCount: number;
	recentDecisions: string[];
	reportFiles: string[];
	modelCount: number;
	dataCount: number;
}

const EMPTY: EngagementInfoData = {
	exists: false,
	engagementId: "",
	client: "",
	title: "",
	status: "",
	opened: "",
	decisionCount: 0,
	recentDecisions: [],
	reportFiles: [],
	modelCount: 0,
	dataCount: 0,
};

const RECENT_DECISIONS = 3;

function parseFrontmatter(text: string): Record<string, string> {
	const fields: Record<string, string> = {};
	const lines = text.split(/\r?\n/);
	if (lines[0]?.trim() !== "---") {
		return fields;
	}
	for (const line of lines.slice(1)) {
		if (line.trim() === "---") {
			break;
		}
		const sep = line.indexOf(":");
		if (sep > 0) {
			fields[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
		}
	}
	return fields;
}

async function countFiles(dir: string): Promise<string[]> {
	try {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		return entries
			.filter((e) => e.isFile())
			.map((e) => e.name)
			.sort();
	} catch {
		return [];
	}
}

/** Read the engagement rooted at `workspaceDir`; `exists: false` when none. */
export async function readEngagementInfo(
	workspaceDir: string,
): Promise<EngagementInfoData> {
	let manifestText: string;
	try {
		manifestText = await fs.readFile(
			path.join(workspaceDir, "engagement.md"),
			"utf-8",
		);
	} catch {
		return EMPTY;
	}
	const fields = parseFrontmatter(manifestText);
	if (!fields.engagement_id) {
		return EMPTY;
	}

	let decisionHeadings: string[] = [];
	try {
		const decisionsText = await fs.readFile(
			path.join(workspaceDir, "decisions.md"),
			"utf-8",
		);
		decisionHeadings = decisionsText
			.split(/\r?\n/)
			.filter((line) => line.startsWith("## "))
			.map((line) => line.slice(3).trim());
	} catch {
		// no decision log yet — fine
	}

	return {
		exists: true,
		engagementId: fields.engagement_id,
		client: fields.client ?? "",
		title: fields.title ?? "",
		status: fields.status ?? "",
		opened: fields.opened ?? "",
		decisionCount: decisionHeadings.length,
		recentDecisions: decisionHeadings.slice(-RECENT_DECISIONS),
		reportFiles: await countFiles(path.join(workspaceDir, "reports")),
		modelCount: (await countFiles(path.join(workspaceDir, "models"))).length,
		dataCount: (await countFiles(path.join(workspaceDir, "data"))).length,
	};
}

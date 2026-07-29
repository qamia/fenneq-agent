import { ModelFamily } from "@/shared/prompts";
import { ClineDefaultTool } from "@/shared/tools";
import type { ClineToolSpec } from "../spec";
import { TASK_PROGRESS_PARAMETER } from "../types";

const id = ClineDefaultTool.RENDER_PLAN;

const DESCRIPTION =
	"Generate a client-ready, branded HTML report from a solved plan and open it in the browser. " +
	"You supply the DATA as JSON; the visual template is built in — do not hand-write report HTML. " +
	"Use this for the final deliverable of an optimization engagement (and after significant re-solves), " +
	"in addition to the markdown plan document. The report is a single self-contained .html file the " +
	"user can send to their client.";

const DATA_INSTRUCTION = `A JSON object with the report content. Fields (all optional except title):
{
 "title": "Stand Allocation — Morning Bank",       (required)
 "subtitle": "Sharjah Intl · tomorrow 06:00–11:00",
 "summary": "One-paragraph statement of the decision and how good it is.",
 "kpis": [{ "label": "Objective", "value": "1 flight bussed", "note": "provably minimal" }],
 "changes": [{ "item": "TK762", "before": "S4", "after": "R1", "why": "..." }],   (include after re-solves)
 "timeline": { "title": "Stand occupancy", "items": [{ "resource": "S5", "label": "EK203", "start": "06:40", "end": "08:50", "highlight": false }] },   (24h HH:mm; highlight=true for bussed/moved/notable)
 "table": { "title": "Plan", "columns": ["Flight", "Stand"], "rows": [["EK203", "S5"]] },
 "notes": ["Assumption or caveat, one per entry."]
}`;

const generic: ClineToolSpec = {
	variant: ModelFamily.GENERIC,
	id,
	name: "render_plan",
	description: DESCRIPTION,
	parameters: [
		{
			name: "path",
			required: true,
			instruction: `Output path for the .html report (relative to the current working directory {{CWD}}{{MULTI_ROOT_HINT}}), e.g. allocation_report.html`,
			usage: "Report file path here",
		},
		{
			name: "data",
			required: true,
			instruction: DATA_INSTRUCTION,
			usage: "JSON report content here",
		},
		TASK_PROGRESS_PARAMETER,
	],
};

const NATIVE_GPT_5: ClineToolSpec = {
	...generic,
	variant: ModelFamily.NATIVE_GPT_5,
};

const NATIVE_NEXT_GEN: ClineToolSpec = {
	...generic,
	variant: ModelFamily.NATIVE_NEXT_GEN,
};

export const render_plan_variants = [generic, NATIVE_GPT_5, NATIVE_NEXT_GEN];

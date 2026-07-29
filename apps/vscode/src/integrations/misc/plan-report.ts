/**
 * Client-grade plan reports for the render_plan tool. The model supplies the
 * DATA (a validated JSON spec); the presentation lives here in code, so every
 * report a consultant hands to a client looks identical, branded, and costs
 * zero LLM tokens of hand-written HTML. Output is a single self-contained
 * .html file — inline CSS, inline SVG, no external requests — that opens in
 * any browser and prints cleanly.
 */

export interface PlanReportKpi {
	label: string;
	value: string;
	note?: string;
}

export interface PlanReportTable {
	title?: string;
	columns: string[];
	rows: (string | number)[][];
}

export interface PlanReportTimelineItem {
	resource: string;
	label: string;
	/** HH:mm (24h) */
	start: string;
	/** HH:mm (24h) */
	end: string;
	/** Render in the accent color (e.g. bussed / moved / violating soft rule). */
	highlight?: boolean;
}

export interface PlanReportChange {
	item: string;
	before: string;
	after: string;
	why: string;
}

export interface PlanReportSpec {
	title: string;
	subtitle?: string;
	summary?: string;
	kpis?: PlanReportKpi[];
	table?: PlanReportTable;
	timeline?: { title?: string; items: PlanReportTimelineItem[] };
	changes?: PlanReportChange[];
	notes?: string[];
}

const MAX_TIMELINE_ITEMS = 200;
const MAX_TABLE_ROWS = 500;

/** Parse + validate the tool's `data` param. Throws with an actionable message. */
export function parsePlanReportSpec(raw: string): PlanReportSpec {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new Error(
			`data is not valid JSON (${error instanceof Error ? error.message : String(error)})`,
		);
	}
	if (typeof parsed !== "object" || parsed === null) {
		throw new Error("data must be a JSON object");
	}
	const spec = parsed as PlanReportSpec;
	if (typeof spec.title !== "string" || spec.title.trim() === "") {
		throw new Error(
			'data.title (string) is required, e.g. "Stand Allocation — Morning Bank"',
		);
	}
	if (spec.table) {
		if (!Array.isArray(spec.table.columns) || !Array.isArray(spec.table.rows)) {
			throw new Error(
				"data.table needs { columns: string[], rows: (string|number)[][] }",
			);
		}
		if (spec.table.rows.length > MAX_TABLE_ROWS) {
			throw new Error(
				`data.table.rows exceeds ${MAX_TABLE_ROWS} rows — summarize or split the report`,
			);
		}
	}
	if (spec.timeline) {
		if (
			!Array.isArray(spec.timeline.items) ||
			spec.timeline.items.length === 0
		) {
			throw new Error(
				"data.timeline needs { items: [{ resource, label, start, end }] } with at least one item",
			);
		}
		if (spec.timeline.items.length > MAX_TIMELINE_ITEMS) {
			throw new Error(
				`data.timeline.items exceeds ${MAX_TIMELINE_ITEMS} — summarize or split the report`,
			);
		}
		for (const item of spec.timeline.items) {
			if (parseHm(item.start) === null || parseHm(item.end) === null) {
				throw new Error(
					`timeline item "${item.label}" has invalid start/end — use 24h HH:mm (got "${item.start}"–"${item.end}")`,
				);
			}
		}
	}
	if (spec.changes && !Array.isArray(spec.changes)) {
		throw new Error(
			"data.changes must be an array of { item, before, after, why }",
		);
	}
	return spec;
}

function esc(value: unknown): string {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function parseHm(t: string): number | null {
	const m = /^(\d{1,2}):(\d{2})$/.exec(String(t ?? "").trim());
	if (!m) {
		return null;
	}
	const minutes = Number(m[1]) * 60 + Number(m[2]);
	return minutes <= 24 * 60 ? minutes : null;
}

function hm(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Occupancy chart: one lane per resource, one bar per assignment. Pure SVG. */
function timelineSvg(items: PlanReportTimelineItem[]): string {
	const resources: string[] = [];
	for (const item of items) {
		if (!resources.includes(item.resource)) {
			resources.push(item.resource);
		}
	}
	const starts = items.map((i) => parseHm(i.start)!);
	const ends = items.map((i) => parseHm(i.end)!);
	const t0 = Math.floor(Math.min(...starts) / 60) * 60;
	const t1 = Math.ceil(Math.max(...ends) / 60) * 60;
	const span = Math.max(t1 - t0, 60);

	const GUTTER = 96;
	const WIDTH = 960;
	const LANE = 34;
	const AXIS = 28;
	const plotW = WIDTH - GUTTER - 16;
	const height = AXIS + resources.length * LANE + 8;
	const x = (t: number) => GUTTER + ((t - t0) / span) * plotW;

	const parts: string[] = [];
	parts.push(
		`<svg viewBox="0 0 ${WIDTH} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" style="width:100%;height:auto;font-family:inherit">`,
	);
	// hour grid + axis labels
	const step = span > 12 * 60 ? 120 : 60;
	for (let t = t0; t <= t1; t += step) {
		parts.push(
			`<line x1="${x(t)}" y1="${AXIS - 8}" x2="${x(t)}" y2="${height - 4}" stroke="#e2e0da" stroke-width="1"/>`,
			`<text x="${x(t)}" y="${AXIS - 14}" font-size="11" fill="#8a8577" text-anchor="middle">${hm(t)}</text>`,
		);
	}
	// lanes
	resources.forEach((resource, lane) => {
		const y = AXIS + lane * LANE;
		if (lane % 2 === 0) {
			parts.push(
				`<rect x="${GUTTER}" y="${y}" width="${plotW}" height="${LANE}" fill="#f7f6f2"/>`,
			);
		}
		parts.push(
			`<text x="${GUTTER - 10}" y="${y + LANE / 2 + 4}" font-size="12" font-weight="600" fill="#3d3a33" text-anchor="end">${esc(resource)}</text>`,
		);
	});
	// bars
	for (const item of items) {
		const lane = resources.indexOf(item.resource);
		const s = parseHm(item.start)!;
		const e = parseHm(item.end)!;
		const y = AXIS + lane * LANE + 5;
		const w = Math.max(x(e) - x(s), 3);
		const fill = item.highlight ? "#b45309" : "#31567d";
		parts.push(
			`<rect x="${x(s)}" y="${y}" width="${w}" height="${LANE - 10}" rx="4" fill="${fill}"><title>${esc(item.label)} ${esc(item.start)}–${esc(item.end)}</title></rect>`,
		);
		const labelInside = w > item.label.length * 7 + 10;
		parts.push(
			labelInside
				? `<text x="${x(s) + w / 2}" y="${y + (LANE - 10) / 2 + 4}" font-size="11" font-weight="600" fill="#ffffff" text-anchor="middle">${esc(item.label)}</text>`
				: `<text x="${x(e) + 6}" y="${y + (LANE - 10) / 2 + 4}" font-size="11" fill="#3d3a33">${esc(item.label)}</text>`,
		);
	}
	parts.push("</svg>");
	return parts.join("");
}

function tableHtml(columns: string[], rows: (string | number)[][]): string {
	const head = columns.map((c) => `<th>${esc(c)}</th>`).join("");
	const body = rows
		.map((r) => `<tr>${r.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`)
		.join("\n");
	return `<table><thead><tr>${head}</tr></thead><tbody>\n${body}\n</tbody></table>`;
}

export function generatePlanReportHtml(spec: PlanReportSpec): string {
	const generatedAt = new Date().toLocaleString(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});
	const sections: string[] = [];

	if (spec.summary) {
		sections.push(`<p class="summary">${esc(spec.summary)}</p>`);
	}
	if (spec.kpis?.length) {
		sections.push(
			`<div class="kpis">${spec.kpis
				.map(
					(k) =>
						`<div class="kpi"><div class="kpi-label">${esc(k.label)}</div><div class="kpi-value">${esc(k.value)}</div>${k.note ? `<div class="kpi-note">${esc(k.note)}</div>` : ""}</div>`,
				)
				.join("")}</div>`,
		);
	}
	if (spec.changes?.length) {
		sections.push(
			`<h2>What changed</h2>` +
				tableHtml(
					["Item", "Before", "After", "Why"],
					spec.changes.map((c) => [c.item, c.before, c.after, c.why]),
				),
		);
	}
	if (spec.timeline) {
		sections.push(
			`<h2>${esc(spec.timeline.title ?? "Timeline")}</h2><div class="chart">${timelineSvg(spec.timeline.items)}</div>`,
		);
	}
	if (spec.table) {
		sections.push(
			`<h2>${esc(spec.table.title ?? "Plan")}</h2>` +
				tableHtml(spec.table.columns, spec.table.rows),
		);
	}
	if (spec.notes?.length) {
		sections.push(
			`<h2>Notes &amp; assumptions</h2><ul class="notes">${spec.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`,
		);
	}

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(spec.title)}</title>
<style>
	:root { color-scheme: light; }
	* { box-sizing: border-box; margin: 0; }
	body { font-family: "Segoe UI", -apple-system, "Helvetica Neue", Arial, sans-serif; color: #26231d; background: #fdfcfa; line-height: 1.55; }
	.page { max-width: 1020px; margin: 0 auto; padding: 40px 32px 64px; }
	.brand { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 3px solid #b45309; padding-bottom: 10px; }
	.brand .mark { font-size: 14px; font-weight: 700; letter-spacing: 0.16em; color: #b45309; text-transform: uppercase; }
	.brand .stamp { font-size: 12px; color: #8a8577; }
	h1 { font-size: 28px; margin: 26px 0 4px; letter-spacing: -0.01em; }
	.subtitle { font-size: 15px; color: #6b665b; margin-bottom: 20px; }
	.summary { font-size: 16px; max-width: 72ch; margin: 8px 0 22px; }
	.kpis { display: flex; flex-wrap: wrap; gap: 14px; margin: 8px 0 26px; }
	.kpi { flex: 1 1 180px; background: #ffffff; border: 1px solid #e7e4dd; border-radius: 10px; padding: 14px 16px; }
	.kpi-label { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #8a8577; }
	.kpi-value { font-size: 22px; font-weight: 700; color: #26231d; margin-top: 2px; }
	.kpi-note { font-size: 12px; color: #6b665b; margin-top: 2px; }
	h2 { font-size: 17px; margin: 30px 0 10px; padding-top: 8px; }
	.chart { background: #ffffff; border: 1px solid #e7e4dd; border-radius: 10px; padding: 16px 12px 8px; }
	table { border-collapse: collapse; width: 100%; font-size: 13.5px; background: #ffffff; border: 1px solid #e7e4dd; border-radius: 10px; overflow: hidden; }
	th { text-align: left; font-size: 11.5px; letter-spacing: 0.06em; text-transform: uppercase; color: #8a8577; background: #f7f6f2; padding: 9px 12px; border-bottom: 1px solid #e7e4dd; }
	td { padding: 8px 12px; border-bottom: 1px solid #f0eee8; }
	tbody tr:last-child td { border-bottom: none; }
	.notes { padding-left: 20px; max-width: 78ch; }
	.notes li { margin-bottom: 6px; }
	footer { margin-top: 44px; font-size: 12px; color: #8a8577; border-top: 1px solid #e7e4dd; padding-top: 12px; }
	@media print { body { background: #ffffff; } .page { padding: 0; max-width: none; } }
</style>
</head>
<body>
<div class="page">
	<div class="brand"><span class="mark">Qortex</span><span class="stamp">Generated ${esc(generatedAt)}</span></div>
	<h1>${esc(spec.title)}</h1>
	${spec.subtitle ? `<div class="subtitle">${esc(spec.subtitle)}</div>` : ""}
	${sections.join("\n")}
	<footer>Prepared with FenneQ — the Qortex optimization agent. Figures reflect the data and constraints supplied at generation time.</footer>
</div>
</body>
</html>
`;
}

import { expect } from "chai";
import { generatePlanReportHtml, parsePlanReportSpec } from "../plan-report";

describe("plan-report", () => {
	const spec = {
		title: "Stand Allocation — Morning Bank",
		subtitle: "Sharjah Intl · 06:00–11:00",
		summary: "All 12 flights parked; 1 bussed (provably minimal).",
		kpis: [{ label: "Objective", value: "1 flight bussed", note: "minimum" }],
		changes: [
			{ item: "TK762", before: "S4", after: "R1", why: "S4 lost to QR911" },
		],
		timeline: {
			title: "Stand occupancy",
			items: [
				{ resource: "S5", label: "EK203", start: "06:40", end: "08:50" },
				{ resource: "S5", label: "RU9440", start: "09:10", end: "10:40" },
				{
					resource: "R1",
					label: "TK762",
					start: "07:20",
					end: "09:00",
					highlight: true,
				},
			],
		},
		table: {
			columns: ["Flight", "Stand"],
			rows: [
				["EK203", "S5"],
				["TK762", "R1"],
			],
		},
		notes: ["G9527 pax missing — treated as 0."],
	};

	it("parses a valid spec and renders every section", () => {
		const html = generatePlanReportHtml(
			parsePlanReportSpec(JSON.stringify(spec)),
		);
		expect(html).to.include("<!doctype html>");
		expect(html).to.include("Stand Allocation — Morning Bank");
		expect(html).to.include("1 flight bussed");
		expect(html).to.include("What changed");
		expect(html).to.include("Stand occupancy");
		expect(html).to.include("<svg");
		expect(html).to.include("EK203");
		expect(html).to.include("G9527 pax missing");
		// highlighted bar uses the accent fill, normal bars the base fill
		expect(html).to.include('fill="#b45309"');
		expect(html).to.include('fill="#31567d"');
		// self-contained: no external requests
		expect(html).to.not.match(/src="http|href="http/);
	});

	it("escapes HTML in every text field", () => {
		const html = generatePlanReportHtml(
			parsePlanReportSpec(
				JSON.stringify({
					title: 'x<script>alert("1")</script>',
					notes: ["a <b> & c"],
				}),
			),
		);
		expect(html).to.not.include("<script>alert");
		expect(html).to.include("&lt;script&gt;");
		expect(html).to.include("a &lt;b&gt; &amp; c");
	});

	it("rejects missing title, bad JSON, and bad timeline times with actionable errors", () => {
		expect(() => parsePlanReportSpec("{nope")).to.throw(/not valid JSON/);
		expect(() => parsePlanReportSpec('{"summary": "no title"}')).to.throw(
			/data\.title/,
		);
		expect(() =>
			parsePlanReportSpec(
				JSON.stringify({
					title: "t",
					timeline: {
						items: [
							{ resource: "S1", label: "X", start: "6h40", end: "08:00" },
						],
					},
				}),
			),
		).to.throw(/HH:mm/);
	});
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import ExcelJS from "exceljs";
import { inspectDataFile } from "../inspect-data";

describe("inspectDataFile", () => {
	let dir: string;

	before(async () => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "inspect-data-"));

		fs.writeFileSync(
			path.join(dir, "flights.csv"),
			"flight,stand,arrival,pax\n" +
				"AF102,S1,2026-07-29 06:10,214\n" +
				"EK203,,2026-07-29 06:40,388\n" +
				"QR911,R2,2026-07-29 07:05,\n",
			"utf-8",
		);

		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet("Stands");
		sheet.addRow(["stand", "type", "max_wingspan_m"]);
		sheet.addRow(["S1", "contact", 65]);
		sheet.addRow(["R2", "remote", 80.5]);
		await workbook.xlsx.writeFile(path.join(dir, "stands.xlsx"));
	});

	after(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("summarizes a CSV: columns, types, missing counts, sample", async () => {
		const out = await inspectDataFile(path.join(dir, "flights.csv"));
		expect(out).to.include("3 data rows, 4 columns");
		expect(out).to.include("flight: text");
		expect(out).to.include("pax: integer");
		expect(out).to.include("missing 1/3"); // empty stand and empty pax each
		expect(out).to.include("AF102");
	});

	it("summarizes an xlsx workbook per sheet", async () => {
		const out = await inspectDataFile(path.join(dir, "stands.xlsx"));
		expect(out).to.include('Sheet "Stands": 2 data rows, 3 columns');
		expect(out).to.include("max_wingspan_m: number");
		expect(out).to.include("range 65..80.5");
		expect(out).to.include("contact");
	});

	it("rejects unsupported formats with guidance", async () => {
		const p = path.join(dir, "notes.pdf");
		fs.writeFileSync(p, "x");
		try {
			await inspectDataFile(p);
			expect.fail("should have thrown");
		} catch (error) {
			expect(String(error)).to.include("inspect_data supports");
		}
	});
});

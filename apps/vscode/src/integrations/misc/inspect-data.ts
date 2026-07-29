import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import ExcelJS from "exceljs";

/**
 * Schema-level inspection of tabular data files (CSV/TSV/XLSX) for the
 * inspect_data tool. Consultants receive real operational spreadsheets; the
 * model must understand their SHAPE — sheets, columns, types, row counts,
 * gaps, samples — without flooding the context window with raw rows.
 * Read-only; never modifies the file.
 */

const SAMPLE_ROWS = 5;
const TYPE_SCAN_ROWS = 200;
const MAX_SCAN_LINES = 1_000_000;
const MAX_SHEETS = 10;
const MAX_COLUMNS = 60;

interface ColumnProfile {
	name: string;
	type: string; // number | integer | date | text | boolean | empty | mixed
	missing: number;
	min?: number;
	max?: number;
}

function inferType(value: string): string {
	const v = value.trim();
	if (v === "") {
		return "empty";
	}
	if (/^(true|false|yes|no)$/i.test(v)) {
		return "boolean";
	}
	if (/^-?\d+$/.test(v)) {
		return "integer";
	}
	if (
		/^-?\d*[.,]\d+([eE][+-]?\d+)?$/.test(v) ||
		/^-?\d+(\.\d+)?[eE][+-]?\d+$/.test(v)
	) {
		return "number";
	}
	if (
		!Number.isNaN(Date.parse(v)) &&
		/[\d]{4}|[\d]{1,2}[/:.-][\d]{1,2}/.test(v)
	) {
		return "date";
	}
	return "text";
}

function mergeType(current: string | undefined, next: string): string {
	if (next === "empty") {
		return current ?? "empty";
	}
	if (current === undefined || current === "empty") {
		return next;
	}
	if (current === next) {
		return current;
	}
	if (
		(current === "integer" && next === "number") ||
		(current === "number" && next === "integer")
	) {
		return "number";
	}
	return "mixed";
}

function sniffDelimiter(headerLine: string): string {
	const candidates: Array<[string, number]> = [
		[",", headerLine.split(",").length],
		[";", headerLine.split(";").length],
		["\t", headerLine.split("\t").length],
		["|", headerLine.split("|").length],
	];
	candidates.sort((a, b) => b[1] - a[1]);
	return candidates[0][1] > 1 ? candidates[0][0] : ",";
}

/** Split one CSV line respecting double quotes (good enough for profiling). */
function splitCsvLine(line: string, delimiter: string): string[] {
	const out: string[] = [];
	let cur = "";
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === '"') {
			if (inQuotes && line[i + 1] === '"') {
				cur += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (ch === delimiter && !inQuotes) {
			out.push(cur);
			cur = "";
		} else {
			cur += ch;
		}
	}
	out.push(cur);
	return out;
}

function profileColumns(header: string[], rows: string[][]): ColumnProfile[] {
	return header.slice(0, MAX_COLUMNS).map((name, idx) => {
		let type: string | undefined;
		let missing = 0;
		let min: number | undefined;
		let max: number | undefined;
		for (const row of rows) {
			const raw = row[idx] ?? "";
			const t = inferType(raw);
			if (t === "empty") {
				missing++;
			} else if (t === "integer" || t === "number") {
				const n = Number.parseFloat(raw.replace(",", "."));
				if (!Number.isNaN(n)) {
					min = min === undefined ? n : Math.min(min, n);
					max = max === undefined ? n : Math.max(max, n);
				}
			}
			type = mergeType(type, t);
		}
		return {
			name: name.trim() || `(col ${idx + 1})`,
			type: type ?? "empty",
			missing,
			min,
			max,
		};
	});
}

function renderColumns(profiles: ColumnProfile[], scanned: number): string {
	const lines = profiles.map((p) => {
		const range =
			p.min !== undefined &&
			p.max !== undefined &&
			(p.type === "number" || p.type === "integer")
				? ` range ${p.min}..${p.max}`
				: "";
		const missing = p.missing > 0 ? ` missing ${p.missing}/${scanned}` : "";
		return `  - ${p.name}: ${p.type}${range}${missing}`;
	});
	return lines.join("\n");
}

function renderSample(header: string[], rows: string[][]): string {
	const take = rows.slice(0, SAMPLE_ROWS);
	if (take.length === 0) {
		return "  (no data rows)";
	}
	const head = header.slice(0, MAX_COLUMNS).join(" | ");
	const body = take
		.map((r) => `  ${r.slice(0, MAX_COLUMNS).join(" | ")}`)
		.join("\n");
	return `  ${head}\n${body}`;
}

async function inspectDelimited(absolutePath: string): Promise<string> {
	const stream = fs.createReadStream(absolutePath, { encoding: "utf-8" });
	const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

	let header: string[] | null = null;
	let delimiter = ",";
	const scanRows: string[][] = [];
	let dataRows = 0;
	let truncated = false;

	for await (const line of rl) {
		if (header === null) {
			delimiter = sniffDelimiter(line);
			header = splitCsvLine(line, delimiter);
			continue;
		}
		dataRows++;
		if (scanRows.length < TYPE_SCAN_ROWS) {
			scanRows.push(splitCsvLine(line, delimiter));
		}
		if (dataRows >= MAX_SCAN_LINES) {
			truncated = true;
			break;
		}
	}
	rl.close();

	if (header === null) {
		return "The file is empty.";
	}
	const delimiterName = delimiter === "\t" ? "tab" : `'${delimiter}'`;
	const profiles = profileColumns(header, scanRows);
	return [
		`File: ${path.basename(absolutePath)} (delimited, delimiter ${delimiterName})`,
		`Rows: ${dataRows}${truncated ? "+ (scan capped)" : ""} data rows, ${header.length} columns${header.length > MAX_COLUMNS ? ` (first ${MAX_COLUMNS} profiled)` : ""}`,
		`Columns (types inferred from first ${Math.min(scanRows.length, TYPE_SCAN_ROWS)} rows):`,
		renderColumns(profiles, scanRows.length),
		`Sample (first ${Math.min(SAMPLE_ROWS, scanRows.length)} rows):`,
		renderSample(header, scanRows),
	].join("\n");
}

function cellToString(value: ExcelJS.CellValue): string {
	if (value === null || value === undefined) {
		return "";
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (typeof value === "object") {
		const obj = value as unknown as Record<string, unknown>;
		if ("result" in obj) {
			return cellToString(obj.result as ExcelJS.CellValue);
		}
		if ("text" in obj) {
			return String(obj.text);
		}
		if ("richText" in obj) {
			return (obj.richText as Array<{ text: string }>)
				.map((r) => r.text)
				.join("");
		}
		return String(value);
	}
	return String(value);
}

async function inspectWorkbook(absolutePath: string): Promise<string> {
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.readFile(absolutePath);

	const sections: string[] = [
		`File: ${path.basename(absolutePath)} (Excel workbook, ${workbook.worksheets.length} sheet${workbook.worksheets.length === 1 ? "" : "s"})`,
	];
	for (const sheet of workbook.worksheets.slice(0, MAX_SHEETS)) {
		const headerRow = sheet.getRow(1);
		const header: string[] = [];
		headerRow.eachCell({ includeEmpty: true }, (cell) => {
			header.push(cellToString(cell.value));
		});
		const dataRowCount = Math.max(0, sheet.rowCount - 1);
		const scanRows: string[][] = [];
		const last = Math.min(sheet.rowCount, 1 + TYPE_SCAN_ROWS);
		for (let r = 2; r <= last; r++) {
			const row = sheet.getRow(r);
			const values: string[] = [];
			for (let c = 1; c <= header.length; c++) {
				values.push(cellToString(row.getCell(c).value));
			}
			scanRows.push(values);
		}
		const profiles = profileColumns(header, scanRows);
		sections.push(
			[
				`Sheet "${sheet.name}": ${dataRowCount} data rows, ${header.length} columns`,
				`Columns (types inferred from first ${scanRows.length} rows):`,
				renderColumns(profiles, scanRows.length),
				`Sample (first ${Math.min(SAMPLE_ROWS, scanRows.length)} rows):`,
				renderSample(header, scanRows),
			].join("\n"),
		);
	}
	if (workbook.worksheets.length > MAX_SHEETS) {
		sections.push(
			`(+${workbook.worksheets.length - MAX_SHEETS} more sheets not shown)`,
		);
	}
	return sections.join("\n\n");
}

/**
 * Inspect a tabular data file and return a compact schema-level summary.
 * Supports .csv/.tsv/.txt (delimited) and .xlsx. Throws on other types.
 */
export async function inspectDataFile(absolutePath: string): Promise<string> {
	const ext = path.extname(absolutePath).toLowerCase();
	if (ext === ".xlsx" || ext === ".xlsm") {
		return inspectWorkbook(absolutePath);
	}
	if (ext === ".csv" || ext === ".tsv" || ext === ".txt") {
		return inspectDelimited(absolutePath);
	}
	throw new Error(
		`inspect_data supports .csv, .tsv, .txt and .xlsx files; got '${ext || "no extension"}'. ` +
			"For other formats, use read_file.",
	);
}

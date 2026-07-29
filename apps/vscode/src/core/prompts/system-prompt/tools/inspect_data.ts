import { ModelFamily } from "@/shared/prompts";
import { ClineDefaultTool } from "@/shared/tools";
import type { ClineToolSpec } from "../spec";
import { TASK_PROGRESS_PARAMETER } from "../types";

const id = ClineDefaultTool.INSPECT_DATA;

const DESCRIPTION =
	"Inspect a tabular data file (.csv, .tsv, .txt, .xlsx) and return a compact schema-level summary: " +
	"sheets, columns with inferred types and value ranges, data row counts, missing-value counts, and a " +
	"few sample rows. Use this BEFORE formulating any optimization model on a data file — it shows the " +
	"file's shape without flooding the context with raw rows. Read-only. For non-tabular files use read_file.";

const generic: ClineToolSpec = {
	variant: ModelFamily.GENERIC,
	id,
	name: "inspect_data",
	description: DESCRIPTION,
	parameters: [
		{
			name: "path",
			required: true,
			instruction: `The path of the data file (relative to the current working directory {{CWD}}{{MULTI_ROOT_HINT}}). Supported: .csv, .tsv, .txt (delimited), .xlsx.`,
			usage: "Data file path here",
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

export const inspect_data_variants = [generic, NATIVE_GPT_5, NATIVE_NEXT_GEN];

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ToolUse } from "@core/assistant-message";
import { formatResponse } from "@core/prompts/responses";
import { resolveWorkspacePath } from "@core/workspace";
import {
	generatePlanReportHtml,
	parsePlanReportSpec,
} from "@integrations/misc/plan-report";
import { getReadablePath, isLocatedInWorkspace } from "@utils/path";
import { ClineDefaultTool } from "@/shared/tools";
import { openExternal } from "@/utils/env";
import type { ToolResponse } from "../../index";
import { showNotificationForApproval } from "../../utils";
import type { IFullyManagedTool } from "../ToolExecutorCoordinator";
import type { ToolValidator } from "../ToolValidator";
import type { TaskConfig } from "../types/TaskConfig";
import type { StronglyTypedUIHelpers } from "../types/UIHelpers";
import { ToolResultUtils } from "../utils/ToolResultUtils";

/**
 * render_plan — turn a solved plan (JSON spec: KPIs, decision table, timeline,
 * what-changed, notes) into a branded, self-contained HTML report written into
 * the workspace and opened in the default browser. The template lives in
 * plan-report.ts; the model only supplies data, so every client deliverable
 * looks identical and costs no tokens of hand-written HTML.
 */
export class RenderPlanToolHandler implements IFullyManagedTool {
	readonly name = ClineDefaultTool.RENDER_PLAN;

	constructor(private validator: ToolValidator) {}

	getDescription(block: ToolUse): string {
		return `[${block.name} for '${block.params.path}']`;
	}

	private sharedMessageProps(
		config: TaskConfig,
		displayPath: string,
		content: string,
	) {
		// Rendered with the newFileCreated card: same approval semantics as
		// creating any workspace file, no webview changes needed.
		return {
			tool: "newFileCreated",
			path: getReadablePath(config.cwd, displayPath),
			content,
		};
	}

	async handlePartialBlock(
		block: ToolUse,
		uiHelpers: StronglyTypedUIHelpers,
	): Promise<void> {
		const relPath = block.params.path;
		const config = uiHelpers.getConfig();
		if (config.isSubagentExecution) {
			return;
		}

		const partialMessage = JSON.stringify({
			...this.sharedMessageProps(
				config,
				uiHelpers.removeClosingTag(block, "path", relPath),
				"",
			),
			operationIsLocatedInWorkspace: await isLocatedInWorkspace(relPath),
		});

		if (await uiHelpers.shouldAutoApproveToolWithPath(block.name, relPath)) {
			await uiHelpers.removeLastPartialMessageIfExistsWithType("ask", "tool");
			await uiHelpers.say(
				"tool",
				partialMessage,
				undefined,
				undefined,
				block.partial,
			);
		} else {
			await uiHelpers.removeLastPartialMessageIfExistsWithType("say", "tool");
			await uiHelpers
				.ask("tool", partialMessage, block.partial)
				.catch(() => {});
		}
	}

	async execute(config: TaskConfig, block: ToolUse): Promise<ToolResponse> {
		const relPath: string | undefined = block.params.path;
		const data: string | undefined = block.params.data;

		for (const [param, value] of [
			["path", relPath],
			["data", data],
		] as const) {
			if (!value) {
				config.taskState.consecutiveMistakeCount++;
				return await config.callbacks.sayAndCreateMissingParamError(
					this.name,
					param,
				);
			}
		}

		const accessValidation = this.validator.checkClineIgnorePath(relPath!);
		if (!accessValidation.ok) {
			config.taskState.consecutiveMistakeCount++;
			if (!config.isSubagentExecution) {
				await config.callbacks.say("clineignore_error", relPath);
			}
			return formatResponse.toolError(
				formatResponse.clineIgnoreError(relPath!),
			);
		}

		let absolutePath: string;
		let displayPath: string;
		let html: string;
		let sectionSummary: string;
		try {
			const spec = parsePlanReportSpec(data!);
			html = generatePlanReportHtml(spec);
			sectionSummary = [
				spec.kpis?.length ? `${spec.kpis.length} KPIs` : undefined,
				spec.changes?.length ? "what-changed table" : undefined,
				spec.timeline
					? `timeline (${spec.timeline.items.length} bars)`
					: undefined,
				spec.table ? `table (${spec.table.rows.length} rows)` : undefined,
				spec.notes?.length ? `${spec.notes.length} notes` : undefined,
			]
				.filter(Boolean)
				.join(", ");

			const pathResult = resolveWorkspacePath(
				config,
				relPath!,
				"RenderPlanToolHandler.execute",
			);
			({ absolutePath, displayPath } =
				typeof pathResult === "string"
					? { absolutePath: pathResult, displayPath: relPath! }
					: pathResult);
		} catch (error) {
			config.taskState.consecutiveMistakeCount++;
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			return formatResponse.toolError(
				`Error rendering plan report: ${errorMessage}`,
			);
		}

		config.taskState.consecutiveMistakeCount = 0;

		const completeMessage = JSON.stringify({
			...this.sharedMessageProps(config, displayPath, html),
			operationIsLocatedInWorkspace: await isLocatedInWorkspace(relPath!),
		});

		const shouldAutoApprove =
			config.isSubagentExecution ||
			(await config.callbacks.shouldAutoApproveToolWithPath(
				block.name,
				relPath,
			));
		if (shouldAutoApprove) {
			if (!config.isSubagentExecution) {
				await config.callbacks.removeLastPartialMessageIfExistsWithType(
					"ask",
					"tool",
				);
				await config.callbacks.say(
					"tool",
					completeMessage,
					undefined,
					undefined,
					false,
				);
			}
		} else {
			showNotificationForApproval(
				`FenneQ wants to create plan report ${getReadablePath(config.cwd, displayPath)}`,
				config.autoApprovalSettings.enableNotifications,
			);
			await config.callbacks.removeLastPartialMessageIfExistsWithType(
				"say",
				"tool",
			);
			const didApprove = await ToolResultUtils.askApprovalAndPushFeedback(
				"tool",
				completeMessage,
				config,
			);
			if (!didApprove) {
				return formatResponse.toolDenied();
			}
		}

		try {
			await fs.mkdir(path.dirname(absolutePath), { recursive: true });
			await fs.writeFile(absolutePath, html, "utf-8");
			config.services.fileContextTracker.markFileAsEditedByCline(relPath!);
		} catch (error) {
			config.taskState.consecutiveMistakeCount++;
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			return formatResponse.toolError(
				`Error writing plan report: ${errorMessage}`,
			);
		}

		// Opening the report is best-effort; the file on disk is the deliverable.
		let opened = true;
		try {
			await openExternal(pathToFileURL(absolutePath).href);
		} catch {
			opened = false;
		}

		return (
			`The plan report was written to ${displayPath} (${sectionSummary})` +
			(opened
				? " and opened in the default browser."
				: ". Open it in a browser to view; automatic opening failed.")
		);
	}
}

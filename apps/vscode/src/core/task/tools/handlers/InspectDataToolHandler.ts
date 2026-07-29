import type { ToolUse } from "@core/assistant-message";
import { formatResponse } from "@core/prompts/responses";
import { resolveWorkspacePath } from "@core/workspace";
import { inspectDataFile } from "@integrations/misc/inspect-data";
import { getReadablePath, isLocatedInWorkspace } from "@utils/path";
import { ClineDefaultTool } from "@/shared/tools";
import type { ToolResponse } from "../../index";
import { showNotificationForApproval } from "../../utils";
import type { IFullyManagedTool } from "../ToolExecutorCoordinator";
import type { ToolValidator } from "../ToolValidator";
import type { TaskConfig } from "../types/TaskConfig";
import type { StronglyTypedUIHelpers } from "../types/UIHelpers";
import { ToolResultUtils } from "../utils/ToolResultUtils";

/**
 * inspect_data — schema-level summary of a tabular data file (CSV/TSV/XLSX):
 * sheets, columns, inferred types, row counts, missing values, sample rows.
 * The optimizer's "look at the data before you model it" tool: read-only and
 * context-cheap where read_file would dump thousands of raw rows.
 */
export class InspectDataToolHandler implements IFullyManagedTool {
	readonly name = ClineDefaultTool.INSPECT_DATA;

	constructor(private validator: ToolValidator) {}

	getDescription(block: ToolUse): string {
		return `[${block.name} for '${block.params.path}']`;
	}

	private sharedMessageProps(
		config: TaskConfig,
		displayPath: string,
		content: string,
	) {
		// Rendered with the readFile card in the webview: same approval
		// semantics (a read of a user file), no webview changes needed.
		return {
			tool: "readFile",
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

		const pathValidation = this.validator.assertRequiredParams(block, "path");
		if (!pathValidation.ok) {
			config.taskState.consecutiveMistakeCount++;
			return await config.callbacks.sayAndCreateMissingParamError(
				this.name,
				"path",
			);
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
		let summary: string;
		try {
			const pathResult = resolveWorkspacePath(
				config,
				relPath!,
				"InspectDataToolHandler.execute",
			);
			({ absolutePath, displayPath } =
				typeof pathResult === "string"
					? { absolutePath: pathResult, displayPath: relPath! }
					: pathResult);
			summary = await inspectDataFile(absolutePath);
		} catch (error) {
			config.taskState.consecutiveMistakeCount++;
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			return formatResponse.toolError(
				`Error inspecting data file: ${errorMessage}`,
			);
		}

		config.taskState.consecutiveMistakeCount = 0;

		const completeMessage = JSON.stringify({
			...this.sharedMessageProps(config, displayPath, summary),
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
				`FenneQ wants to inspect data file ${getReadablePath(config.cwd, displayPath)}`,
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

		return summary;
	}
}

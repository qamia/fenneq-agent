import { isAnthropicModelId } from "@utils/model-utils";
import { getShell } from "@utils/shell";
import type { SystemPromptContext } from "@/core/prompts/system-prompt/types";
import { generateFenneqFormulationTemplate } from "../fenneq-formulation";
import type { DeepPlanningVariant } from "../types";

/**
 * Creates the Anthropic Claude variant for deep-planning prompt
 * This variant is optimized for Claude models
 */
export function createAnthropicVariant(): DeepPlanningVariant {
	return {
		id: "anthropic",
		description: "Deep-planning variant optimized for Anthropic Claude models",
		family: "anthropic",
		version: 1,
		matcher: (context: SystemPromptContext) => {
			const modelId = context.providerInfo?.model?.id;
			if (!modelId) {
				return false;
			}
			return isAnthropicModelId(modelId);
		},
		template: generateTemplate(),
	};
}

/**
 * Generates the deep-planning template with shell-specific commands
 */
function generateTemplate(): string {
	const detectedShell = getShell();

	// FIXME: detectedShell returns a non-string value on some Windows machines
	let isPowerShell = false;
	try {
		isPowerShell =
			detectedShell != null &&
			typeof detectedShell === "string" &&
			(detectedShell.toLowerCase().includes("powershell") ||
				detectedShell.toLowerCase().includes("pwsh"));
	} catch {}

	// Qortex: deep planning is model formulation, not codebase archaeology.
	return generateFenneqFormulationTemplate(isPowerShell);
}

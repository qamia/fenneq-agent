import { getShell } from "@utils/shell";
import { generateFenneqFormulationTemplate } from "../fenneq-formulation";
import type { DeepPlanningVariant } from "../types";

/**
 * Creates the generic fallback variant for deep-planning prompt
 * This variant is used when no specific model family matcher applies
 */
export function createGenericVariant(): DeepPlanningVariant {
	return {
		id: "generic",
		description:
			"Generic fallback variant for deep-planning prompt, used for all models",
		family: "generic",
		version: 1,
		matcher: () => true, // Always matches as fallback
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

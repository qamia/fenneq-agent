import {
	CLAUDE_SONNET_1M_SUFFIX,
	FENNEQ_PLANNED_OPTIONS,
	FENNEQ_TIER_LABELS,
	fenneqTierModels,
} from "@shared/api";
import type { Mode } from "@shared/storage/types";
import {
	isClaudeOpusAdaptiveThinkingModel,
	resolveClaudeOpusAdaptiveThinking,
} from "@shared/utils/reasoning-support";
import { useExtensionState } from "@/context/ExtensionStateContext";
import { ApiKeyField } from "../common/ApiKeyField";
import { ModelInfoView } from "../common/ModelInfoView";
import { ModelSelector } from "../common/ModelSelector";
import ReasoningEffortSelector from "../ReasoningEffortSelector";
import ThinkingBudgetSlider from "../ThinkingBudgetSlider";
import {
	getModeSpecificFields,
	normalizeApiConfiguration,
} from "../utils/providerUtils";
import { useApiConfigurationHandlers } from "../utils/useApiConfigurationHandlers";

// Anthropic models that support thinking/reasoning mode
export const SUPPORTED_ANTHROPIC_THINKING_MODELS = [
	"claude-sonnet-4-6",
	`claude-sonnet-4-6${CLAUDE_SONNET_1M_SUFFIX}`,
	"claude-3-7-sonnet-20250219",
	"claude-sonnet-4-20250514",
	`claude-sonnet-4-20250514${CLAUDE_SONNET_1M_SUFFIX}`,
	"claude-opus-4-20250514",
	"claude-opus-4-1-20250805",
	"claude-sonnet-4-5-20250929",
	`claude-sonnet-4-5-20250929${CLAUDE_SONNET_1M_SUFFIX}`,
	"claude-haiku-4-5-20251001",
];

/**
 * Props for the AnthropicProvider component
 */
interface AnthropicProviderProps {
	showModelOptions: boolean;
	isPopup?: boolean;
	currentMode: Mode;
}

/**
 * The Anthropic provider configuration component
 */
export const AnthropicProvider = ({
	showModelOptions,
	isPopup,
	currentMode,
}: AnthropicProviderProps) => {
	const { apiConfiguration } = useExtensionState();
	const { handleFieldChange, handleModeFieldChange } =
		useApiConfigurationHandlers();
	const modeFields = getModeSpecificFields(apiConfiguration, currentMode);

	// Get the normalized configuration
	const { selectedModelId, selectedModelInfo } = normalizeApiConfiguration(
		apiConfiguration,
		currentMode,
	);
	const isAdaptiveThinkingModel =
		isClaudeOpusAdaptiveThinkingModel(selectedModelId);
	const adaptiveThinkingDefaultEffort =
		resolveClaudeOpusAdaptiveThinking(
			modeFields.reasoningEffort,
			modeFields.thinkingBudgetTokens,
		).effort ?? "none";

	return (
		<div>
			{/* BYOK: the Qortex key (the user's own key) is normally entered via the
			    launch prompt; this field lets them view/change it. Then pick a tier. */}
			<ApiKeyField
				initialValue={apiConfiguration?.apiKey || ""}
				onChange={(value) => handleFieldChange("apiKey", value)}
				providerName="Qortex"
				signupUrl="https://console.anthropic.com/settings/keys"
			/>
			{showModelOptions && (
				<>
					<ModelSelector
						disabledOptions={FENNEQ_PLANNED_OPTIONS}
						label="FenneQ tier"
						labels={FENNEQ_TIER_LABELS}
						models={fenneqTierModels}
						onChange={(e) => {
							// Rukh (Kimi K3) lives on the Moonshot provider — picking it
							// from the tier list switches the provider along with the model.
							if (e.target.value === "kimi-k3") {
								handleModeFieldChange(
									{ plan: "planModeApiProvider", act: "actModeApiProvider" },
									// biome-ignore lint/suspicious/noExplicitAny: provider union comes from upstream signature
									"moonshot" as any,
									currentMode,
								);
							}
							handleModeFieldChange(
								{ plan: "planModeApiModelId", act: "actModeApiModelId" },
								e.target.value,
								currentMode,
							);
						}}
						selectedModelId={selectedModelId}
					/>

					{isAdaptiveThinkingModel ? (
						<ReasoningEffortSelector
							allowedEfforts={
								["none", "low", "medium", "high", "xhigh"] as const
							}
							currentMode={currentMode}
							defaultEffort={adaptiveThinkingDefaultEffort}
							description="Use None to disable adaptive thinking. Higher effort increases response detail and token usage."
							label="Adaptive Thinking"
						/>
					) : SUPPORTED_ANTHROPIC_THINKING_MODELS.includes(selectedModelId) ? (
						<ThinkingBudgetSlider
							currentMode={currentMode}
							maxBudget={selectedModelInfo.thinkingConfig?.maxBudget}
						/>
					) : null}

					<ModelInfoView
						isPopup={isPopup}
						modelInfo={selectedModelInfo}
						selectedModelId={selectedModelId}
					/>
				</>
			)}
		</div>
	);
};

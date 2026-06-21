import { useState } from "react";
import ClineLogoWhite from "@/assets/ClineLogoWhite";
import { Button } from "@/components/ui/button";
import { useExtensionState } from "@/context/ExtensionStateContext";
import { StateServiceClient } from "@/services/grpc-client";
import { ApiKeyField } from "../settings/common/ApiKeyField";
import { useApiConfigurationHandlers } from "../settings/utils/useApiConfigurationHandlers";

/**
 * BYOK onboarding — the first screen a new user sees. A single, focused form:
 * paste your own Anthropic API key, then start. The key is stored locally and the
 * agent talks to Anthropic directly (no proxy / no account). A hosted "FenneQ Cloud"
 * mode can add a sign-in path here later.
 */
const OnboardingView = () => {
	const { apiConfiguration, setShowWelcome } = useExtensionState();
	const { handleFieldChange } = useApiConfigurationHandlers();
	const [busy, setBusy] = useState(false);

	const hasKey = Boolean(apiConfiguration?.apiKey?.trim());

	const handleStart = async () => {
		if (!hasKey) {
			return;
		}
		setBusy(true);
		try {
			await StateServiceClient.setWelcomeViewCompleted({ value: true });
			setShowWelcome(false);
		} catch (error) {
			console.error("Failed to complete onboarding:", error);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="fixed inset-0 flex flex-col items-center justify-center px-6">
			<div className="flex w-full max-w-md flex-col items-center gap-5">
				<ClineLogoWhite className="size-16 flex-shrink-0" />

				<div className="text-center">
					<h2 className="m-0 text-2xl font-semibold">Welcome to Qortex</h2>
					<p className="mt-1 text-foreground/70">
						Paste your Anthropic API key to start using FenneQ.
					</p>
				</div>

				<div className="w-full">
					<ApiKeyField
						initialValue={apiConfiguration?.apiKey || ""}
						onChange={(value) => handleFieldChange("apiKey", value)}
						placeholder="sk-ant-..."
						providerName="Anthropic"
						signupUrl="https://console.anthropic.com/settings/keys"
					/>
				</div>

				<Button
					className="w-full rounded-xs"
					disabled={!hasKey || busy}
					onClick={handleStart}
				>
					{busy ? "Starting…" : "Start coding"}
				</Button>

				<p className="m-0 text-center text-xs text-foreground/60">
					Your key is stored locally on this machine and is used only to call
					Anthropic directly. You pay Anthropic for your own usage. You can
					change this anytime in settings.
				</p>
			</div>
		</div>
	);
};

export default OnboardingView;

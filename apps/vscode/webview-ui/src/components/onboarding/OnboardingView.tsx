import { useState } from "react";
import FenneqLogo from "@/assets/FenneqLogo";
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
			<div className="flex w-full max-w-lg flex-col items-center gap-6 rounded-xl border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] p-8 shadow-lg">
				<div className="flex size-20 flex-shrink-0 items-center justify-center rounded-2xl bg-white p-2 shadow-sm">
					<FenneqLogo className="size-full object-contain" />
				</div>

				<div className="text-center">
					<p className="m-0 text-xs font-semibold uppercase tracking-wide text-foreground/50">
						Welcome to Qortex
					</p>
					<h2 className="m-0 mt-1 text-3xl font-semibold">
						Enter your Anthropic API key
					</h2>
					<p className="mt-2 text-sm text-foreground/70">
						FenneQ uses your own Anthropic key to talk to Claude. It's stored
						locally on this machine and never shared.
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
					Don't have a key? Get one at console.anthropic.com. You pay Anthropic
					for your own usage.
				</p>
			</div>
		</div>
	);
};

export default OnboardingView;

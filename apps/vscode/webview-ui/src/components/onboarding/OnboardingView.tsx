import { useState } from "react";
import FenneqLogo from "@/assets/FenneqLogo";
import { Button } from "@/components/ui/button";
import { useExtensionState } from "@/context/ExtensionStateContext";
import { StateServiceClient } from "@/services/grpc-client";

/**
 * Welcome screen (first run). The Qortex key (the user's Anthropic key) is collected
 * by the native launch prompt (see extension.ts), so this screen has no key form —
 * just a welcome and a Get started button.
 */
const OnboardingView = () => {
	const { setShowWelcome } = useExtensionState();
	const [busy, setBusy] = useState(false);

	const handleStart = async () => {
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
			<div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
				<div className="flex size-20 flex-shrink-0 items-center justify-center rounded-2xl bg-white p-2 shadow-sm">
					<FenneqLogo className="size-full object-contain" />
				</div>
				<div>
					<h2 className="m-0 text-2xl font-semibold">Welcome to Qortex</h2>
					<p className="mt-2 text-sm text-foreground/70">
						Your AI coding companion, powered by FenneQ. Pick a tier — Zenith,
						Borealis or Solstice — and start building.
					</p>
				</div>
				<Button
					className="w-full rounded-xs"
					disabled={busy}
					onClick={handleStart}
				>
					{busy ? "Starting…" : "Get started"}
				</Button>
			</div>
		</div>
	);
};

export default OnboardingView;

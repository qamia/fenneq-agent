import { useMemo } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface CheckpointErrorProps {
	checkpointManagerErrorMessage?: string;
	handleCheckpointSettingsClick: () => void;
}
export const CheckpointError: React.FC<CheckpointErrorProps> = ({
	checkpointManagerErrorMessage,
	handleCheckpointSettingsClick,
}) => {
	const messages = useMemo(() => {
		const message = checkpointManagerErrorMessage?.replace(
			/disabling checkpoints\.$/,
			"",
		);
		const showDisableButton =
			checkpointManagerErrorMessage?.endsWith("disabling checkpoints.") ||
			checkpointManagerErrorMessage?.includes("multi-root workspaces");
		const showGitInstructions = checkpointManagerErrorMessage?.includes(
			"Git must be installed to use checkpoints.",
		);
		// Expected limitations (e.g. no project folder open yet) are a neutral
		// notice, not a red alert — first-run users shouldn't be greeted by danger.
		const isExpectedLimitation = checkpointManagerErrorMessage?.includes(
			"open a project folder",
		);
		return {
			message,
			showDisableButton,
			showGitInstructions,
			isExpectedLimitation,
		};
	}, [checkpointManagerErrorMessage]);

	if (!checkpointManagerErrorMessage) {
		return null;
	}

	return (
		<div className="flex items-center justify-center w-full">
			<Alert
				title={messages.message}
				variant={messages.isExpectedLimitation ? "default" : "danger"}
			>
				<AlertDescription className="flex gap-2 justify-end">
					{messages.showDisableButton && (
						<Button
							aria-label="Disable Checkpoints"
							onClick={handleCheckpointSettingsClick}
							variant="ghost"
						>
							Disable Checkpoints
						</Button>
					)}
					{messages.showGitInstructions && (
						<a
							className="text-link underline"
							href="https://github.com/cline/cline/wiki/Installing-Git-for-Checkpoints"
						>
							See instructions
						</a>
					)}
				</AlertDescription>
			</Alert>
		</div>
	);
};

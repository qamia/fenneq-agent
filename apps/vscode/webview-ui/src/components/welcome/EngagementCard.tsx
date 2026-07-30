import { EmptyRequest, StringRequest } from "@shared/proto/cline/common";
import type { EngagementInfo } from "@shared/proto/cline/file";
import { useEffect, useState } from "react";
import { FileServiceClient } from "@/services/grpc-client";

/**
 * The engagement's home on the welcome screen: who the client is, where the
 * work stands, what was decided, and the deliverables produced so far. Renders
 * nothing when the workspace has no engagement.md — the card is the reward for
 * letting FenneQ open an engagement.
 */

const STATUS_STYLES: Record<string, string> = {
	discovery:
		"text-[var(--vscode-charts-blue)] border-[var(--vscode-charts-blue)]",
	formulated:
		"text-[var(--vscode-charts-purple)] border-[var(--vscode-charts-purple)]",
	solved:
		"text-[var(--vscode-charts-green)] border-[var(--vscode-charts-green)]",
	delivered:
		"text-[var(--vscode-charts-green)] border-[var(--vscode-charts-green)]",
	closed:
		"text-[var(--vscode-descriptionForeground)] border-[var(--vscode-descriptionForeground)]",
};

const EngagementCard = () => {
	const [info, setInfo] = useState<EngagementInfo | null>(null);

	useEffect(() => {
		FileServiceClient.getEngagementInfo(EmptyRequest.create())
			.then((result) => {
				if (result.exists) {
					setInfo(result);
				}
			})
			.catch((error) => {
				console.error("Error reading engagement info:", error);
			});
	}, []);

	if (!info) {
		return null;
	}

	const openReport = (name: string) => {
		FileServiceClient.openFileRelativePath(
			StringRequest.create({ value: `reports/${name}` }),
		).catch((error) => console.error("Error opening report:", error));
	};

	const statusStyle = STATUS_STYLES[info.status] ?? STATUS_STYLES.discovery;

	return (
		<div className="mx-4 mb-3 px-4 py-3 rounded-md border border-(--vscode-panel-border) bg-white/2 select-none">
			<div className="flex items-baseline justify-between gap-2">
				<div className="min-w-0">
					<div className="text-sm font-semibold truncate text-(--vscode-editor-foreground)">
						{info.title}
					</div>
					<div className="text-xs truncate text-(--vscode-descriptionForeground)">
						{info.client}
						{info.opened ? ` · since ${info.opened}` : ""}
					</div>
				</div>
				<span
					className={`shrink-0 text-[10px] font-semibold uppercase tracking-wider border rounded-full px-2 py-0.5 ${statusStyle}`}
				>
					{info.status}
				</span>
			</div>

			<div className="mt-2 text-xs text-(--vscode-descriptionForeground)">
				{info.decisionCount} decision{info.decisionCount === 1 ? "" : "s"} ·{" "}
				{info.reportFiles.length} report
				{info.reportFiles.length === 1 ? "" : "s"} · {info.modelCount} model
				{info.modelCount === 1 ? "" : "s"} · {info.dataCount} data file
				{info.dataCount === 1 ? "" : "s"}
			</div>

			{info.recentDecisions.length > 0 && (
				<ul className="mt-2 mb-0 pl-4 text-xs text-(--vscode-editor-foreground) space-y-0.5">
					{info.recentDecisions.map((decision) => (
						<li className="truncate" key={decision} title={decision}>
							{decision}
						</li>
					))}
				</ul>
			)}

			{info.reportFiles.length > 0 && (
				<div className="mt-2 flex flex-wrap gap-1.5">
					{info.reportFiles.map((name) => (
						<button
							className="text-[11px] px-2 py-0.5 rounded-full border border-(--vscode-panel-border) bg-transparent text-(--vscode-textLink-foreground) hover:bg-(--vscode-list-hoverBackground) cursor-pointer"
							key={name}
							onClick={() => openReport(name)}
							type="button"
						>
							{name}
						</button>
					))}
				</div>
			)}
		</div>
	);
};

export default EngagementCard;

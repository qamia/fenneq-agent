import { readEngagementInfo } from "@integrations/misc/engagement-info";
import type { EmptyRequest } from "@shared/proto/cline/common";
import { EngagementInfo } from "@shared/proto/cline/file";
import { getCwd, getDesktopDir } from "@/utils/path";
import type { Controller } from "..";

/**
 * Reads the current workspace's engagement (engagement.md + decisions.md +
 * artifact folders) for the welcome-screen engagement card. exists=false when
 * the workspace has no engagement manifest.
 */
export async function getEngagementInfo(
	_controller: Controller,
	_request: EmptyRequest,
): Promise<EngagementInfo> {
	const cwd = await getCwd(getDesktopDir());
	const info = await readEngagementInfo(cwd);
	return EngagementInfo.create({
		exists: info.exists,
		engagementId: info.engagementId,
		client: info.client,
		title: info.title,
		status: info.status,
		opened: info.opened,
		decisionCount: info.decisionCount,
		recentDecisions: info.recentDecisions,
		reportFiles: info.reportFiles,
		modelCount: info.modelCount,
		dataCount: info.dataCount,
	});
}

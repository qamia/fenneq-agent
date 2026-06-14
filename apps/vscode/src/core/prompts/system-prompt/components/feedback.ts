import { SystemPromptSection } from "../templates/placeholders"
import { TemplateEngine } from "../templates/TemplateEngine"
import type { PromptVariant, SystemPromptContext } from "../types"

const FEEDBACK_TEMPLATE_TEXT = `
If the user asks for help or wants to give feedback inform them of the following: 
- To give feedback, users should report the issue using the /reportbug slash command in the chat. 

When the user directly asks about FenneQ (eg 'can FenneQ do...', 'does FenneQ have...') or asks in second person (eg 'are you able...', 'can you do...'), explain the tool's capabilities directly or point them to the FenneQ repository at https://github.com/qamia/fenneq-agent.
  - FenneQ supports the usual agentic coding features: plan/act workflows, auto-approve, checkpoints, custom rules, task and context management, a broad set of tools, and Model Context Protocol (MCP) servers.
  - FenneQ is based on Cline (Apache-2.0, https://github.com/cline/cline).`

export async function getFeedbackSection(variant: PromptVariant, context: SystemPromptContext): Promise<string | undefined> {
	if (!context.focusChainSettings?.enabled) {
		return undefined
	}

	const template = variant.componentOverrides?.[SystemPromptSection.FEEDBACK]?.template || FEEDBACK_TEMPLATE_TEXT

	return new TemplateEngine().resolve(template, context, {})
}

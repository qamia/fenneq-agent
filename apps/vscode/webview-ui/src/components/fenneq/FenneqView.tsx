import { BotIcon, CpuIcon } from "lucide-react"
import ViewHeader from "@/components/common/ViewHeader"
import { type FenneqMode, useFenneqMode } from "@/context/FenneqModeContext"

type ModeOption = {
	id: FenneqMode
	name: string
	summary: string
	details: string
	icon: typeof BotIcon
}

const MODE_OPTIONS: ModeOption[] = [
	{
		id: "assistant",
		name: "Assistant",
		summary: "The FenneQ MCP server, as it is today.",
		details:
			"Cline runs the task and calls FenneQ through MCP for optimization expertise — interview questions, captured lessons, and session persistence. This is the default.",
		icon: BotIcon,
	},
	{
		id: "harness",
		name: "Harness",
		summary: "The FenneQ agentic platform drives the task.",
		details:
			"The agentic platform plans, acts, and reviews each step; Cline is the shell around it. Use this for work the platform's own agents should own end to end.",
		icon: CpuIcon,
	},
]

type FenneqViewProps = {
	onDone: () => void
}

const FenneqView = ({ onDone }: FenneqViewProps) => {
	const { mode, setMode } = useFenneqMode()

	return (
		<div className="fixed inset-0 flex flex-col overflow-hidden">
			<ViewHeader onDone={onDone} title="FenneQ" />
			<div className="grow overflow-y-auto px-5 pb-5">
				<p className="mt-0 mb-4 text-sm text-description">
					Choose which backend answers your tasks. Every Cline feature stays available in both modes — switching
					changes the engine, not the toolset.
				</p>

				<div aria-label="FenneQ mode" className="flex flex-col gap-2" role="radiogroup">
					{MODE_OPTIONS.map((option) => {
						const isSelected = mode === option.id
						const accent = `var(--fenneq-${option.id}-accent)`
						return (
							<label
								className="flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors"
								htmlFor={`fenneq-mode-${option.id}`}
								key={option.id}
								style={{
									borderColor: isSelected ? accent : "var(--vscode-panel-border)",
									backgroundColor: isSelected
										? `color-mix(in srgb, ${accent} 10%, transparent)`
										: "transparent",
								}}>
								<input
									aria-describedby={`fenneq-mode-${option.id}-details`}
									checked={isSelected}
									className="mt-1 shrink-0"
									id={`fenneq-mode-${option.id}`}
									name="fenneq-mode"
									onChange={() => setMode(option.id)}
									style={{ accentColor: accent }}
									type="radio"
									value={option.id}
								/>
								<div className="min-w-0">
									<div className="flex items-center gap-2">
										<option.icon size={15} style={{ color: accent }} />
										<span className="font-medium">{option.name}</span>
									</div>
									<div className="mt-0.5 text-sm">{option.summary}</div>
									<div className="mt-1 text-xs text-description" id={`fenneq-mode-${option.id}-details`}>
										{option.details}
									</div>
								</div>
							</label>
						)
					})}
				</div>

				<p className="mt-4 text-xs text-description">
					The active mode tints the sidebar background so it stays visible while you work.
				</p>
			</div>
		</div>
	)
}

export default FenneqView

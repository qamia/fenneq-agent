export interface QuickWinTask {
	id: string;
	title: string;
	description: string;
	icon?: string;
	actionCommand: string;
	prompt: string;
	buttonText?: string;
}

// The empty state teaches the domain: three briefs drawn from the actual
// skill base, each self-sufficient — FenneQ generates sample data when the
// user has none, so every starter runs the full loop to a real deliverable.
export const quickWinTasks: QuickWinTask[] = [
	{
		id: "stand_allocation_plan",
		title: "Plan tomorrow's stand allocation",
		description: "From a flight list to a solved, visual gantt plan",
		icon: "PlanIcon",
		actionCommand: "qortex/startStandAllocation",
		prompt:
			"I want a stand allocation plan for an airport morning bank. Load your stand_allocation skill and walk me through discovery. If I don't point you to data files, generate a realistic sample dataset yourself (a flights CSV with arrivals, departures, wingspans and pax; a stands file with contact/remote types, max wingspan and one closure window) and solve on that: formulate with HARD/SOFT constraint tags, solve, and deliver the plan with a gantt chart and the client report.",
		buttonText: ">",
	},
	{
		id: "diagnose_infeasible",
		title: "Diagnose an infeasible schedule",
		description: "Find the conflicting constraints and rank the ways out",
		icon: "DiagnoseIcon",
		actionCommand: "qortex/diagnoseInfeasibility",
		prompt:
			"Show me how you handle infeasibility. Build a small stand-allocation instance that is genuinely infeasible — for example a wide-body that must be on a contact stand while the only wide-enough contact stand is closed — then diagnose it: isolate the minimal conflicting constraint set, explain the clash in plain operational language, and propose relaxations ranked by business cost. Apply the best one and re-solve to a feasible plan.",
		buttonText: ">",
	},
	{
		id: "compare_strategies",
		title: "Compare two allocation strategies",
		description: "Two objectives, one recommendation, a what-changed table",
		icon: "CompareIcon",
		actionCommand: "qortex/compareStrategies",
		prompt:
			"Compare two strategies on the same allocation problem: (A) minimize bussed passengers versus (B) balance utilization across stands. Use sample data if I don't provide any. Solve both, show a what-changed table between the two plans, compare their KPIs, and give one recommendation with the trade-off in numbers — then generate the client report for the winner.",
		buttonText: ">",
	},
];

/**
 * FenneQ "formulate the model" template for the /deep-planning command.
 *
 * Qortex repurposes deep planning from codebase archaeology into what a
 * consultant does before writing any model code: inspect the data, interview
 * for constraints, and produce a formulation document that an implementation
 * task can execute without re-investigation. The four-step mechanical
 * contract of the original command is preserved (silent investigation →
 * discussion → plan document → new_task handoff with task_progress); only
 * the discipline changes. Shared by the anthropic and generic variants —
 * the model paths Qortex ships.
 */

export function generateFenneqFormulationTemplate(
	isPowerShell: boolean,
): string {
	return `<explicit_instructions type="deep-planning">
Your task is to produce a complete OPTIMIZATION MODEL FORMULATION before writing any model code. This process has four distinct steps that must be completed in order.

Be methodical: a formulation with a missing constraint or a wrong unit costs far more to fix after solving. The quality of your investigation directly determines whether the model's answers can be trusted.

## STEP 1: Silent Investigation

<important>
Do not write model code until explicitly instructed by the user to proceed.
Understand the problem, the knowledge base, and the data completely before proposing a formulation.
Perform your research without commentary or narration. Only speak up when you have specific questions for the user.
</important>

### Required Research Activities
- Use the fenneq MCP server FIRST: list skills, load the skill matching this problem class, and recall lessons — they encode constraints and mistakes from past engagements that must shape this formulation.
- Use read_file to examine every data file involved and any existing model or formulation documents.
- Use terminal commands to profile the data. Tailor them to the actual files; keep output concise.

### Essential Terminal Commands
${
	isPowerShell
		? `# Discover data and model files
Get-ChildItem -Recurse -Include "*.csv","*.xlsx","*.json","*.md","*.py" | Select-Object -First 30 | Select-Object FullName

# Peek at each CSV: header + first rows
Get-Content data.csv -TotalCount 15

# Row counts (data volume drives solver choice)
(Get-Content data.csv | Measure-Object -Line).Lines

# Hunt for units, dates and identifiers in column names
Get-Content data.csv -TotalCount 1
`
		: `# Discover data and model files
find . -name "*.csv" -o -name "*.xlsx" -o -name "*.json" -o -name "*.md" -o -name "*.py" | head -30 | cat

# Peek at each CSV: header + first rows
head -15 data.csv | cat

# Row counts (data volume drives solver choice)
wc -l *.csv | cat

# Hunt for units, dates and identifiers in column names
head -1 *.csv | cat
`
}

## STEP 2: Discussion and Questions

Ask the user the questions the formulation cannot proceed without. Prefer the skill's discovery playbook (fenneq_next_question) when a skill matched. Focus on:
- What exactly is being DECIDED (the variables), and at what granularity?
- For each stated limit: is it HARD (can never be violated) or SOFT (a preference with a penalty)? Who says so?
- What does "better" mean, and in what units? If several objectives compete, what is the priority or exchange rate?
- Data gaps found in Step 1: missing values, ambiguous units, suspicious outliers.

Do not proceed while a material answer is missing or a unit is ambiguous.

## STEP 3: Create the Formulation Document

Create a structured markdown document containing the complete formulation. The document must be saved as model_formulation.md and *must* be structured as follows:

# Model Formulation

[Problem Statement]
Single sentence stating the decision and the objective.

Paragraphs giving context: the operation, the planning horizon, what triggers a re-solve, and what the user will do with the answer.

[Decision Variables]
Single sentence describing the variable family.

Complete list: name, meaning, domain (binary/integer/continuous), and indexing sets (e.g. assign[f, s] = 1 if flight f parks on stand s).

[Objective]
Single sentence naming the primary objective and its units.

The full objective with priorities or weights, including tie-breakers, and the source of each weight.

[Hard Constraints]
Single sentence counting them.

One entry per constraint: plain-language statement, mathematical sketch, data it needs, and its SOURCE (who/what makes it inviolable). Include the lessons applied from the knowledge base.

[Soft Constraints & Penalties]
Single sentence counting them.

One entry per preference: statement, penalty structure, weight relative to the objective, and who confirmed it is soft.

[Data Requirements]
Single sentence describing the data situation.

Per input file: columns used, units, row counts, gaps or anomalies found in Step 1 and how each is handled (never silently dropped).

[Solver & Approach]
Single sentence naming the solver.

The skill's recommended solver and why it fits (CP-SAT for feasibility-heavy scheduling; Pyomo/HiGHS fallback), model size estimate, time limit, and the INFEASIBILITY PLAN: how conflicts will be isolated (IIS or systematic relaxation) and explained in domain terms.

[Validation Plan]
Single sentence describing how the answer will be checked.

Checks that every HARD constraint holds in the produced solution, sanity bounds on the objective, and the before/after comparison the user will see.

[Implementation Order]
Single sentence describing the sequence.

Numbered steps: data loader, variables, constraints (hard first), objective, solve, feasibility check, interpretation/report.

## STEP 4: Create Implementation Task

Use the new_task command to create a task for implementing the formulation. The task must include a <task_progress> list that breaks the implementation into trackable steps.

### Task Creation Requirements

The new task must be self-contained and reference the formulation document rather than requiring re-investigation. Include these navigation commands (adapt them to the document you actually wrote) in the task description:

${
	isPowerShell
		? `
# Read Problem Statement
$content = Get-Content model_formulation.md; $start = ($content | Select-String -Pattern '\\[Problem Statement\\]').LineNumber; $end = ($content | Select-String -Pattern '\\[Decision Variables\\]').LineNumber; $content[($start-1)..($end-2)]

# Read Decision Variables
$content = Get-Content model_formulation.md; $start = ($content | Select-String -Pattern '\\[Decision Variables\\]').LineNumber; $end = ($content | Select-String -Pattern '\\[Objective\\]').LineNumber; $content[($start-1)..($end-2)]

# Read Hard Constraints
$content = Get-Content model_formulation.md; $start = ($content | Select-String -Pattern '\\[Hard Constraints\\]').LineNumber; $end = ($content | Select-String -Pattern '\\[Soft Constraints & Penalties\\]').LineNumber; $content[($start-1)..($end-2)]

# Read Solver & Approach
$content = Get-Content model_formulation.md; $start = ($content | Select-String -Pattern '\\[Solver & Approach\\]').LineNumber; $end = ($content | Select-String -Pattern '\\[Validation Plan\\]').LineNumber; $content[($start-1)..($end-2)]

# Read Implementation Order
$content = Get-Content model_formulation.md; $start = ($content | Select-String -Pattern '\\[Implementation Order\\]').LineNumber; $content[($start-1)..($content.Length-1)]
`
		: `
# Read Problem Statement
sed -n '/\\[Problem Statement\\]/,/\\[Decision Variables\\]/p' model_formulation.md | cat

# Read Decision Variables
sed -n '/\\[Decision Variables\\]/,/\\[Objective\\]/p' model_formulation.md | cat

# Read Hard Constraints
sed -n '/\\[Hard Constraints\\]/,/\\[Soft Constraints & Penalties\\]/p' model_formulation.md | cat

# Read Solver & Approach
sed -n '/\\[Solver & Approach\\]/,/\\[Validation Plan\\]/p' model_formulation.md | cat

# Read Implementation Order
sed -n '/\\[Implementation Order\\]/,$p' model_formulation.md | cat
`
}

**Task Progress Format:**
<IMPORTANT>
You absolutely must include the task_progress contents in context when creating the new task. When providing it, do not wrap it in XML tags- instead provide it like this:


task_progress Items:
- [ ] Step 1: Load and validate the data (report gaps against the formulation)
- [ ] Step 2: Implement decision variables and HARD constraints
- [ ] Step 3: Implement soft constraints, penalties, and the objective
- [ ] Step 4: Solve; on INFEASIBLE run the infeasibility plan (IIS, domain-language conflict, ranked relaxations)
- [ ] Step 5: Validate every hard constraint in the solution; report decision, objective with units, binding constraints


You also MUST include the path to the markdown file you have created in your new task prompt. You should do this as follows:

Refer to @path/to/file/markdown.md for a complete breakdown of the formulation and implementation steps. You should periodically read this file again.

{{FOCUS_CHAIN_PARAM}}

{{NEW_TASK_INSTRUCTIONS}}

### Mode Switching

When creating the new task, request a switch to "act mode" if you are currently in "plan mode". This ensures the implementation agent operates in execution mode rather than planning mode.
</IMPORTANT>

## Quality Standards

Be specific: exact file paths, column names, constraint sources, and units. Another consultant must be able to implement the model from the document alone — without re-interviewing the user or re-profiling the data. If a constraint's HARD/SOFT status is uncertain, it is not done.

---

**Execute all four steps in sequence. Your role is to formulate thoroughly, not to implement. Model code begins only after the new task is created and you receive explicit instruction to proceed.**

Below is the user's input when they indicated that they wanted to create a complete model formulation.
</explicit_instructions>
`;
}

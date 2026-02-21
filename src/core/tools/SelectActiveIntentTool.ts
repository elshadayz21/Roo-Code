import * as path from "path"
import * as fs from "fs/promises"
import * as yaml from "yaml"
import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { getWorkspacePath } from "../../utils/path"
import { fileExistsAtPath } from "../../utils/fs"

interface SelectActiveIntentParams {
	intent_id: string
}

/**
 * Represents a single trace entry from agent_trace.jsonl.
 */
interface TraceEntry {
	id: string
	timestamp: string
	vcs?: { revision_id: string }
	files?: Array<{
		relative_path: string
		conversations?: Array<{
			url?: string
			contributor?: { entity_type: string; model_identifier?: string }
			ranges?: Array<{
				start_line: number
				end_line: number
				content_hash: string
			}>
			related?: Array<{ type: string; value: string }>
		}>
	}>
}

export class SelectActiveIntentTool extends BaseTool<"select_active_intent"> {
	readonly name = "select_active_intent" as const

	/**
	 * Reads the agent_trace.jsonl ledger and returns entries whose conversations
	 * reference the given intent ID via the `related` field.
	 */
	private async loadRelatedTraceEntries(workspaceRoot: string, intentId: string): Promise<TraceEntry[]> {
		const tracePath = path.join(workspaceRoot, ".orchestration", "agent_trace.jsonl")

		if (!(await fileExistsAtPath(tracePath))) {
			console.log(`[SelectActiveIntentTool] No agent_trace.jsonl found at: ${tracePath}`)
			return []
		}

		try {
			const raw = await fs.readFile(tracePath, "utf-8")
			const lines = raw.split("\n").filter((line) => line.trim().length > 0)
			const matched: TraceEntry[] = []

			for (const line of lines) {
				try {
					const entry: TraceEntry = JSON.parse(line)
					// Check if any conversation in any file references this intent
					const isRelated = entry.files?.some((f) =>
						f.conversations?.some((c) =>
							c.related?.some(
								(r) =>
									r.value === intentId ||
									r.value.startsWith(intentId) ||
									// Also match specification IDs like "REQ-001" that map to intents
									r.type === "specification",
							),
						),
					)
					if (isRelated) {
						matched.push(entry)
					}
				} catch {
					// Skip malformed lines
				}
			}

			console.log(`[SelectActiveIntentTool] Found ${matched.length} related trace entries for intent ${intentId}`)
			return matched
		} catch (err) {
			console.error("[SelectActiveIntentTool] Failed to read agent_trace.jsonl:", err)
			return []
		}
	}

	async execute(params: SelectActiveIntentParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { intent_id } = params
		const { handleError, pushToolResult } = callbacks

		try {
			if (!intent_id) {
				task.consecutiveMistakeCount++
				task.recordToolError("select_active_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(await task.sayAndCreateMissingParamError("select_active_intent", "intent_id"))
				return
			}

			// Context Injection Logic
			const workspaceRoot = getWorkspacePath()
			const orchestrationPath = path.join(workspaceRoot, ".orchestration", "active_intents.yaml")

			console.log(`[SelectActiveIntentTool] Checking orchestration at: ${orchestrationPath}`)

			if (!(await fileExistsAtPath(orchestrationPath))) {
				console.error(`[SelectActiveIntentTool] Orchestration file not found at: ${orchestrationPath}`)
				pushToolResult(formatResponse.toolResult(`Error: Orchestration file not found at ${orchestrationPath}`))
				return
			}

			const content = await fs.readFile(orchestrationPath, "utf-8")
			let data: any

			try {
				data = yaml.parse(content)
			} catch (yamlError) {
				console.error("[SelectActiveIntentTool] Failed to parse YAML:", yamlError)
				pushToolResult(
					formatResponse.toolResult(`Error: Failed to parse orchestration YAML at ${orchestrationPath}`),
				)
				return
			}

			const intent = data?.active_intents?.find((i: any) => i.id === intent_id)

			if (!intent) {
				const availableIds = data?.active_intents?.map((i: any) => i.id).join(", ") || "none"
				const errorMessage = `Intent ID "${intent_id}" not found in orchestration. Available IDs: ${availableIds}`
				console.error(`[SelectActiveIntentTool] ${errorMessage}`)
				task.consecutiveMistakeCount++
				task.recordToolError("select_active_intent")
				task.didToolFailInCurrentTurn = true
				pushToolResult(formatResponse.toolResult(`Error: ${errorMessage}`))
				return
			}

			// === Phase 1: Context Injection — Build <intent_context> XML ===

			// 1. Intent metadata
			const constraintsXml =
				intent.constraints && Array.isArray(intent.constraints)
					? intent.constraints.map((c: string) => `    <constraint>${c}</constraint>`).join("\n")
					: ""

			const scopeXml =
				intent.owned_scope && Array.isArray(intent.owned_scope)
					? intent.owned_scope.map((s: string) => `    <path>${s}</path>`).join("\n")
					: ""

			const criteriaXml =
				intent.acceptance_criteria && Array.isArray(intent.acceptance_criteria)
					? intent.acceptance_criteria.map((a: string) => `    <criterion>${a}</criterion>`).join("\n")
					: ""

			// 2. Related trace entries from agent_trace.jsonl (the Ledger)
			const traceEntries = await this.loadRelatedTraceEntries(workspaceRoot, intent_id)

			let traceXml = ""
			if (traceEntries.length > 0) {
				const traceItems = traceEntries
					.map((entry) => {
						const filesXml =
							entry.files
								?.map((f) => {
									const rangesXml =
										f.conversations
											?.flatMap((c) => c.ranges ?? [])
											.map(
												(r) =>
													`          <range start="${r.start_line}" end="${r.end_line}" hash="${r.content_hash}" />`,
											)
											.join("\n") ?? ""
									return `        <file path="${f.relative_path}">\n${rangesXml}\n        </file>`
								})
								.join("\n") ?? ""

						return `      <trace id="${entry.id}" timestamp="${entry.timestamp}">\n${filesXml}\n      </trace>`
					})
					.join("\n")

				traceXml = `\n  <agent_trace_history>\n${traceItems}\n  </agent_trace_history>`
			}

			const intentContextXml = `<intent_context>
  <intent_id>${intent.id}</intent_id>
  <name>${intent.name}</name>
  <status>${intent.status}</status>
  <constraints>
${constraintsXml}
  </constraints>
  <owned_scope>
${scopeXml}
  </owned_scope>
  <acceptance_criteria>
${criteriaXml}
  </acceptance_criteria>${traceXml}
</intent_context>`

			// Set governance state on the Task
			task.activeIntentId = intent_id

			task.consecutiveMistakeCount = 0
			const traceInfo = traceEntries.length > 0 ? ` (${traceEntries.length} prior trace entries loaded)` : ""
			await task.say("text", `[Intent Selected: ${intent_id}] Context loaded for: ${intent.name}${traceInfo}`)
			pushToolResult(formatResponse.toolResult(intentContextXml))
		} catch (error) {
			await handleError("selecting active intent", error as Error)
		}
	}
}

export const selectActiveIntentTool = new SelectActiveIntentTool()

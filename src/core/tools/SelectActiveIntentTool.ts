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

export class SelectActiveIntentTool extends BaseTool<"select_active_intent"> {
	readonly name = "select_active_intent" as const

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
  </acceptance_criteria>
</intent_context>`

			// Set governance state on the Task
			task.activeIntentId = intent_id

			task.consecutiveMistakeCount = 0
			await task.say("text", `[Intent Selected: ${intent_id}] Context loaded for: ${intent.name}`)
			pushToolResult(formatResponse.toolResult(intentContextXml))
		} catch (error) {
			await handleError("selecting active intent", error as Error)
		}
	}
}

export const selectActiveIntentTool = new SelectActiveIntentTool()

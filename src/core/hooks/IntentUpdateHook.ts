import { ToolHook, HookContext, HookResult } from "./ToolHook"
import * as path from "path"
import * as fs from "fs/promises"
import * as yaml from "yaml"
import { getWorkspacePath } from "../../utils/path"
import { fileExistsAtPath } from "../../utils/fs"
import { ToolResponse } from "../../shared/tools"

export class IntentUpdateHook implements ToolHook {
	readonly id = "intent-update"

	async onPreExecute(context: HookContext): Promise<HookResult> {
		return { blocked: false }
	}

	async onPostExecute(context: HookContext, result: ToolResponse): Promise<void> {
		const { task, block } = context

		// Only care about select_active_intent or attempt_completion
		if (block.name !== "select_active_intent" && block.name !== "attempt_completion") {
			return
		}

		// If no active intent is set, there's nothing to update
		if (!task.activeIntentId) {
			return
		}

		const workspaceRoot = getWorkspacePath()
		const orchestrationPath = path.join(workspaceRoot, ".orchestration", "active_intents.yaml")

		if (!(await fileExistsAtPath(orchestrationPath))) {
			console.warn(`[IntentUpdateHook] Orchestration file not found at: ${orchestrationPath}`)
			return
		}

		try {
			const content = await fs.readFile(orchestrationPath, "utf-8")
			const data = yaml.parse(content)

			if (!data || !data.active_intents || !Array.isArray(data.active_intents)) {
				return
			}

			const intentIndex = data.active_intents.findIndex((i: any) => i.id === task.activeIntentId)

			if (intentIndex === -1) {
				return
			}

			let newStatus = data.active_intents[intentIndex].status

			if (block.name === "select_active_intent") {
				newStatus = "IN_PROGRESS"
			} else if (block.name === "attempt_completion") {
				newStatus = "COMPLETED"
			}

			if (data.active_intents[intentIndex].status !== newStatus) {
				data.active_intents[intentIndex].status = newStatus
				// Convert back to yaml and write
				const updatedYaml = yaml.stringify(data)
				await fs.writeFile(orchestrationPath, updatedYaml, "utf-8")
				console.log(`[IntentUpdateHook] Updated intent ${task.activeIntentId} status to ${newStatus}`)
			}
		} catch (error) {
			console.error("[IntentUpdateHook] Failed to update active_intents.yaml:", error)
		}
	}
}

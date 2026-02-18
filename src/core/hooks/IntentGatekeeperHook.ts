import { ToolHook, HookContext, HookResult } from "./ToolHook"

/**
 * Enforces the "Reasoning Loop" governance:
 * Blocks side-effect tools if no active intent has been declared.
 */
export class IntentGatekeeperHook implements ToolHook {
	readonly id = "intent-gatekeeper"

	// Tools that REQUIRE an active intent
	private readonly sideEffectTools = [
		"write_to_file",
		"apply_diff",
		"execute_command",
		"insert_content",
		"search_and_replace",
		"browser_action",
		"use_mcp_tool",
		"switch_mode",
		"new_task",
	]

	async onPreExecute(context: HookContext): Promise<HookResult> {
		const { task, block } = context

		if (this.sideEffectTools.includes(block.name)) {
			if (!task.activeIntentId) {
				const errorMessage =
					"GOVERNANCE ERROR: You must call select_active_intent with a valid Intent ID before using any other tools. Please call select_active_intent first."

				console.warn(`[GatekeeperHook] Blocked tool "${block.name}" — no activeIntentId on task ${task.taskId}`)

				return {
					blocked: true,
					errorMessage,
				}
			}
		}

		return { blocked: false }
	}
}

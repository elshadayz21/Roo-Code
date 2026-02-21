import type { ToolName } from "@roo-code/types"

/**
 * Command classification for tool calls.
 *
 * Inspired by the principle that a codebase is a collection of intents—
 * every destructive tool call is a mutation to the intent graph and
 * must be authorized before execution.
 *
 * Safe commands: read-only, no side effects on the file system or environment.
 * Destructive commands: modify the file system, run shell commands, or delegate
 *   execution to external systems.
 */
export const SAFE_TOOLS: ReadonlySet<string> = new Set([
	"read_file",
	"list_files",
	"search_files",
	"codebase_search",
	"ask_followup_question",
	"attempt_completion",
	"read_command_output",
	"select_active_intent",
	"update_todo_list",
])

export const DESTRUCTIVE_TOOLS: ReadonlySet<string> = new Set([
	"write_to_file",
	"apply_diff",
	"edit",
	"search_and_replace",
	"search_replace",
	"edit_file",
	"apply_patch",
	"execute_command",
	"use_mcp_tool",
	"access_mcp_resource",
	"switch_mode",
	"new_task",
	"generate_image",
	"run_slash_command",
	"skill",
])

export type CommandClass = "SAFE" | "DESTRUCTIVE" | "UNKNOWN"

export function classifyCommand(toolName: string): CommandClass {
	if (SAFE_TOOLS.has(toolName)) {
		return "SAFE"
	}
	if (DESTRUCTIVE_TOOLS.has(toolName)) {
		return "DESTRUCTIVE"
	}
	return "UNKNOWN"
}

/**
 * Builds the standardized autonomous-recovery JSON error payload.
 * When the LLM receives this, it can self-correct without crashing.
 */
export function buildRejectionError(params: {
	code: string
	message: string
	toolName: string
	intentId?: string
	recoveryHint?: string
}): string {
	return JSON.stringify(
		{
			error: "TOOL_REJECTED",
			code: params.code,
			tool: params.toolName,
			intent_id: params.intentId ?? null,
			message: params.message,
			recovery_hint:
				params.recoveryHint ??
				"Please try a different approach that does not require this action, ask the user for guidance, or request scope expansion via select_active_intent.",
		},
		null,
		2,
	)
}

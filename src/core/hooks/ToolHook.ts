import { Task } from "../task/Task"
import { ToolUse } from "../../shared/tools"
import { ToolResponse } from "../../shared/tools"

/**
 * Context provided to every tool hook during execution.
 */
export interface HookContext {
	/** The Task instance (formerly Cline) processing the message. */
	task: Task
	/** The parsed tool use block. */
	block: ToolUse
	/** The unique ID of the tool call. */
	toolCallId: string
}

/**
 * Result of a hook execution.
 */
export interface HookResult {
	/** If true, the hook has blocked execution of subsequent hooks and the tool itself. */
	blocked?: boolean
	/** The error message to return if blocked. */
	errorMessage?: string
	/** Optional refined arguments or transformation for the tool. */
	transformedBlock?: ToolUse
}

/**
 * Interface for intercepting tool calls.
 */
export interface ToolHook {
	/** Unique identifier for the hook. */
	readonly id: string

	/**
	 * Called before a tool is dispatched for execution.
	 * Return a HookResult with { blocked: true } to prevent the tool from running.
	 */
	onPreExecute(context: HookContext): Promise<HookResult>

	/**
	 * Called after a tool has completed execution.
	 * Can be used for logging, telemetry, or refining the result.
	 */
	onPostExecute?(context: HookContext, result: ToolResponse): Promise<void>
}

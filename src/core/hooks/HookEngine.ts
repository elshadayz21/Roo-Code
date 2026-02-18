import { ToolHook, HookContext, HookResult } from "./ToolHook"
import { ToolResponse } from "../../shared/tools"

/**
 * Centrally manages tool call interception via registered hooks.
 */
export class HookEngine {
	private hooks: ToolHook[] = []

	/**
	 * Registers a new hook in the engine.
	 */
	registerHook(hook: ToolHook): void {
		if (this.hooks.some((h) => h.id === hook.id)) {
			// Replace existing hook with same ID (hot reloading support or re-initialization)
			this.hooks = this.hooks.filter((h) => h.id !== hook.id)
		}
		this.hooks.push(hook)
	}

	/**
	 * Runs all pre-execution hooks in order.
	 * If any hook blocks, rest are skipped and the blockage is returned.
	 */
	async runPreHooks(context: HookContext): Promise<HookResult> {
		let currentBlock = context.block

		for (const hook of this.hooks) {
			const result = await hook.onPreExecute({ ...context, block: currentBlock })
			if (result.blocked) {
				return result
			}
			if (result.transformedBlock) {
				currentBlock = result.transformedBlock
			}
		}

		return { blocked: false, transformedBlock: currentBlock }
	}

	/**
	 * Runs all post-execution hooks.
	 */
	async runPostHooks(context: HookContext, result: ToolResponse): Promise<void> {
		for (const hook of this.hooks) {
			if (hook.onPostExecute) {
				try {
					await hook.onPostExecute(context, result)
				} catch (error) {
					console.error(`[HookEngine] Error in post-hook "${hook.id}":`, error)
				}
			}
		}
	}
}

/**
 * Singleton instance for global access if needed,
 * or can be instantiated per Cline/Task.
 */
export const globalHookEngine = new HookEngine()

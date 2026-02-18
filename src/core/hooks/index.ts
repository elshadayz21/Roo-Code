import { globalHookEngine } from "./HookEngine"
import { IntentGatekeeperHook } from "./IntentGatekeeperHook"

/**
 * Initialize the global hook engine with default system hooks.
 * This can be called during extension activation.
 */
export function initializeHooks() {
	globalHookEngine.registerHook(new IntentGatekeeperHook())
}

// Auto-initialize for simplicity in this implementation,
// though manual control is often preferred.
initializeHooks()

export * from "./ToolHook"
export * from "./HookEngine"
export * from "./IntentGatekeeperHook"

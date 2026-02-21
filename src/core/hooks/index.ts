import { globalHookEngine } from "./HookEngine"
import { IntentGatekeeperHook } from "./IntentGatekeeperHook"
import { IntentUpdateHook } from "./IntentUpdateHook"
import { TracePostHook } from "./TracePostHook"

/**
 * Initialize the global hook engine with default system hooks.
 * This can be called during extension activation.
 */
export function initializeHooks() {
	globalHookEngine.registerHook(new IntentGatekeeperHook())
	globalHookEngine.registerHook(new IntentUpdateHook())
	globalHookEngine.registerHook(new TracePostHook())
}

// Auto-initialize for simplicity in this implementation,
// though manual control is often preferred.
initializeHooks()

export * from "./ToolHook"
export * from "./HookEngine"
export * from "./IntentGatekeeperHook"
export * from "./IntentUpdateHook"
export * from "./TracePostHook"

import { globalHookEngine } from "./HookEngine"
import { IntentGatekeeperHook } from "./IntentGatekeeperHook"
import { IntentUpdateHook } from "./IntentUpdateHook"
import { TracePostHook } from "./TracePostHook"
import { AuthorizationHook } from "./AuthorizationHook"
import { ScopeEnforcementHook } from "./ScopeEnforcementHook"
import { OptimisticLockHook } from "./OptimisticLockHook"

/**
 * Initialize the global hook engine with all system hooks.
 *
 * Hook execution order (pre-hooks):
 *   1. IntentGatekeeperHook  — blocks tools if no intent is selected
 *   2. OptimisticLockHook    — blocks stale writes (concurrent agent safety)
 *   3. ScopeEnforcementHook  — blocks writes that violate the intent's owned_scope
 *   4. AuthorizationHook     — prompts developer to Approve/Reject destructive tools
 *
 * Post-hooks:
 *   5. IntentUpdateHook      — updates intent status in active_intents.yaml
 *   6. TracePostHook         — appends content-hashed trace entry to agent_trace.jsonl
 */
export function initializeHooks() {
	globalHookEngine.registerHook(new IntentGatekeeperHook())
	globalHookEngine.registerHook(new OptimisticLockHook())
	globalHookEngine.registerHook(new ScopeEnforcementHook())
	globalHookEngine.registerHook(new AuthorizationHook())
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
export * from "./CommandClassifier"
export * from "./AuthorizationHook"
export * from "./ScopeEnforcementHook"
export * from "./SpatialHasher"
export * from "./MutationClassifier"
export * from "./OptimisticLockHook"

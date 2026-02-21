import * as path from "path"
import * as fs from "fs/promises"
import * as yaml from "yaml"
import { ToolHook, HookContext, HookResult } from "./ToolHook"
import { getWorkspacePath } from "../../utils/path"
import { fileExistsAtPath } from "../../utils/fs"
import { buildRejectionError } from "./CommandClassifier"

/**
 * Performs glob-style matching to check if a path matches a scope pattern.
 *
 * Supports:
 *   - Exact path match: "src/auth/middleware.ts"
 *   - Directory prefix: "src/auth/" matches anything under src/auth/
 *   - Glob ** wildcard: "src/auth/**" matches any depth under src/auth
 *   - Glob * wildcard: "src/auth/*.ts" matches files directly in src/auth/
 */
function matchesScope(filePath: string, pattern: string): boolean {
	// Normalize separators to posix style for consistent matching
	const normalizedFile = filePath.replace(/\\/g, "/")
	const normalizedPattern = pattern.replace(/\\/g, "/")

	// Exact match
	if (normalizedFile === normalizedPattern) {
		return true
	}

	// Simple glob conversion: convert ** and * to regex equivalents
	const regexStr = normalizedPattern
		// escape regex meta chars except * and /
		.replace(/[.+^${}()|[\]\\]/g, "\\$&")
		// ** means any path segment (including /)
		.replace(/\*\*/g, "§GLOBSTAR§")
		// * means any char except /
		.replace(/\*/g, "[^/]*")
		// restore globstar as .*
		.replace(/§GLOBSTAR§/g, ".*")

	const regex = new RegExp(`^${regexStr}$`)
	if (regex.test(normalizedFile)) {
		return true
	}

	// Directory prefix match: if pattern ends with / or pattern is a directory
	const dirPattern = normalizedPattern.endsWith("/") ? normalizedPattern : `${normalizedPattern}/`
	if (normalizedFile.startsWith(dirPattern)) {
		return true
	}

	return false
}

interface IntentSpec {
	id: string
	owned_scope?: string[]
}

/**
 * ScopeEnforcementHook — Phase 2 security boundary.
 *
 * For file-writing tools, validates that the target file falls within
 * the `owned_scope` of the currently active intent. If not, blocks
 * the tool and returns a scope violation error so the LLM can
 * request scope expansion instead of silently touching out-of-scope files.
 */
export class ScopeEnforcementHook implements ToolHook {
	readonly id = "scope-enforcement"

	/** Write tools whose target path must be validated against the intent scope. */
	private readonly writeTools = new Set([
		"write_to_file",
		"apply_diff",
		"edit",
		"search_and_replace",
		"search_replace",
		"edit_file",
		"apply_patch",
	])

	private async loadActiveIntent(workspaceRoot: string, intentId: string): Promise<IntentSpec | null> {
		const yamlPath = path.join(workspaceRoot, ".orchestration", "active_intents.yaml")

		if (!(await fileExistsAtPath(yamlPath))) {
			return null
		}

		try {
			const raw = await fs.readFile(yamlPath, "utf-8")
			const data = yaml.parse(raw)
			return (data?.active_intents as IntentSpec[])?.find((i) => i.id === intentId) ?? null
		} catch {
			return null
		}
	}

	async onPreExecute(context: HookContext): Promise<HookResult> {
		const { task, block } = context

		// Only apply to write tools
		if (!this.writeTools.has(block.name)) {
			return { blocked: false }
		}

		// Scope enforcement only makes sense when an intent is active
		if (!task.activeIntentId) {
			return { blocked: false }
		}

		// Extract target file path from tool params
		const params = block.params as Record<string, any>
		const rawFilePath: string | undefined = params.path || params.file_path

		if (!rawFilePath) {
			// No target path — cannot enforce scope, let other hooks decide
			return { blocked: false }
		}

		const workspaceRoot = getWorkspacePath()

		// Resolve to a workspace-relative path for scope matching
		let relativeFilePath: string
		if (path.isAbsolute(rawFilePath)) {
			relativeFilePath = path.relative(workspaceRoot, rawFilePath).replace(/\\/g, "/")
		} else {
			relativeFilePath = rawFilePath.replace(/\\/g, "/")
		}

		// Load the active intent spec
		const intent = await this.loadActiveIntent(workspaceRoot, task.activeIntentId)

		if (!intent) {
			// Intent not found in YAML — cannot validate scope, proceed
			console.warn(
				`[ScopeEnforcementHook] Active intent "${task.activeIntentId}" not found in active_intents.yaml — skipping scope check`,
			)
			return { blocked: false }
		}

		const owned = intent.owned_scope

		// If no owned_scope is defined, we cannot enforce — let it through
		if (!owned || owned.length === 0) {
			return { blocked: false }
		}

		const inScope = owned.some((pattern) => matchesScope(relativeFilePath, pattern))

		if (!inScope) {
			const errorPayload = buildRejectionError({
				code: "SCOPE_VIOLATION",
				message: `Scope Violation: ${task.activeIntentId} is not authorized to edit "${relativeFilePath}". Request scope expansion.`,
				toolName: block.name,
				intentId: task.activeIntentId,
				recoveryHint:
					`The file "${relativeFilePath}" is outside the owned scope of intent "${task.activeIntentId}". ` +
					`You must either restrict your edits to the allowed scope (${owned.join(", ")}) ` +
					`or ask the user to add this file to the intent's owned_scope in active_intents.yaml before proceeding.`,
			})

			console.warn(
				`[ScopeEnforcementHook] SCOPE VIOLATION — intent "${task.activeIntentId}" attempted to edit out-of-scope file: "${relativeFilePath}"`,
			)

			return { blocked: true, errorMessage: errorPayload }
		}

		return { blocked: false }
	}

	async onPostExecute(): Promise<void> {
		// No post-execute logic required
	}
}

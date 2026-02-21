import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs/promises"
import { ToolHook, HookContext, HookResult } from "./ToolHook"
import { getWorkspacePath } from "../../utils/path"
import { fileExistsAtPath } from "../../utils/fs"
import { classifyCommand, buildRejectionError } from "./CommandClassifier"

/**
 * AuthorizationHook — Phase 2 security boundary.
 *
 * For every DESTRUCTIVE tool:
 *  1. Checks the `.orchestration/.intentignore` file. If the active intent
 *     is listed, the tool is allowed through silently (bypass).
 *  2. Otherwise, shows a VS Code modal asking the developer to Approve or Reject.
 *  3. If rejected, returns a structured JSON error so the LLM can self-correct.
 */
export class AuthorizationHook implements ToolHook {
	readonly id = "authorization"

	/** Cached set of bypassed intent IDs from .intentignore */
	private intentIgnoreCache: Set<string> | null = null
	private intentIgnorePath: string | null = null

	private async loadIntentIgnore(workspaceRoot: string): Promise<Set<string>> {
		const ignorePath = path.join(workspaceRoot, ".orchestration", ".intentignore")

		// Invalidate cache if path changed (workspace change)
		if (this.intentIgnorePath !== ignorePath) {
			this.intentIgnoreCache = null
			this.intentIgnorePath = ignorePath
		}

		if (this.intentIgnoreCache !== null) {
			return this.intentIgnoreCache
		}

		const ignored = new Set<string>()

		if (!(await fileExistsAtPath(ignorePath))) {
			this.intentIgnoreCache = ignored
			return ignored
		}

		try {
			const raw = await fs.readFile(ignorePath, "utf-8")
			for (const line of raw.split("\n")) {
				const trimmed = line.trim()
				// Skip blank lines and comments (# style)
				if (trimmed.length > 0 && !trimmed.startsWith("#")) {
					ignored.add(trimmed)
				}
			}
		} catch (err) {
			console.warn("[AuthorizationHook] Failed to read .intentignore:", err)
		}

		this.intentIgnoreCache = ignored
		return ignored
	}

	/** Invalidates the .intentignore cache (e.g. after file changes). */
	invalidateCache(): void {
		this.intentIgnoreCache = null
	}

	async onPreExecute(context: HookContext): Promise<HookResult> {
		const { task, block } = context
		const classification = classifyCommand(block.name)

		// Safe tools are always allowed through
		if (classification !== "DESTRUCTIVE") {
			return { blocked: false }
		}

		const workspaceRoot = getWorkspacePath()
		const activeIntentId = task.activeIntentId ?? "(no intent)"

		// Check .intentignore — if this intent is bypassed, skip dialog
		try {
			const ignored = await this.loadIntentIgnore(workspaceRoot)
			if (ignored.has(activeIntentId)) {
				console.log(
					`[AuthorizationHook] Bypassed authorization for intent "${activeIntentId}" (listed in .intentignore)`,
				)
				return { blocked: false }
			}
		} catch {
			// Silently degrade — do not block on ignore-file errors
		}

		// === UI-Blocking Authorization Dialog ===
		const toolLabel = block.name.replace(/_/g, " ")
		const fileHint =
			(block.params as any)?.path || (block.params as any)?.file_path
				? ` on "${(block.params as any).path || (block.params as any).file_path}"`
				: ""

		const message = `[Intent: ${activeIntentId}] Approve "${toolLabel}"${fileHint}?`

		const choice = await vscode.window.showWarningMessage(message, { modal: true }, "Approve", "Reject")

		if (choice !== "Approve") {
			const errorPayload = buildRejectionError({
				code: "USER_REJECTED_INTENT_EVOLUTION",
				message: `The developer rejected the tool call "${block.name}"${fileHint}. Reconsider your approach.`,
				toolName: block.name,
				intentId: task.activeIntentId,
				recoveryHint:
					"Pause and ask the user what they would like you to do differently, or try an alternative approach that achieves the same goal.",
			})

			console.warn(`[AuthorizationHook] Developer rejected tool "${block.name}" for intent "${activeIntentId}"`)
			return { blocked: true, errorMessage: errorPayload }
		}

		return { blocked: false }
	}

	async onPostExecute(): Promise<void> {
		// No post-execute logic required for this hook
	}
}

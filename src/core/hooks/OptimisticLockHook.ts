import * as path from "path"
import * as fs from "fs/promises"
import { ToolHook, HookContext, HookResult } from "./ToolHook"
import { getWorkspacePath } from "../../utils/path"
import { fileExistsAtPath } from "../../utils/fs"
import { hashContent } from "./SpatialHasher"
import { buildRejectionError } from "./CommandClassifier"

/**
 * OptimisticLockHook — Phase 4 concurrency control.
 *
 * Implements the "Master Thinker" pattern for parallel AI agent orchestration.
 * When multiple agents (or a human + agent) may write to the same file,
 * this hook prevents lost-update conflicts using optimistic locking:
 *
 *   Agent reads file → records its sha256 hash as `expected_hash`
 *   Agent writes file → passes `expected_hash` with the tool call
 *   Hook computes current file hash → compares with `expected_hash`
 *   If different → STALE_FILE error → agent re-reads and retries
 *
 * This is opt-in: if `expected_hash` is not provided, the hook
 * passes through silently (backward compatible with existing workflows).
 */
export class OptimisticLockHook implements ToolHook {
	readonly id = "optimistic-lock"

	/** Write tools subject to optimistic locking */
	private readonly writeTools = new Set([
		"write_to_file",
		"apply_diff",
		"edit",
		"search_and_replace",
		"search_replace",
		"edit_file",
		"apply_patch",
	])

	async onPreExecute(context: HookContext): Promise<HookResult> {
		const { block } = context

		if (!this.writeTools.has(block.name)) {
			return { blocked: false }
		}

		const params = block.params as Record<string, any>
		const nativeArgs = (block as any).nativeArgs as Record<string, any> | undefined

		// Opt-in: only enforce if the agent actually provided expected_hash
		const expectedHash: string | null | undefined = nativeArgs?.expected_hash ?? params.expected_hash ?? null

		if (!expectedHash) {
			return { blocked: false }
		}

		const rawFilePath: string = nativeArgs?.path ?? params.path ?? params.file_path ?? ""

		if (!rawFilePath) {
			return { blocked: false }
		}

		const workspaceRoot = getWorkspacePath()
		const absPath = path.isAbsolute(rawFilePath) ? rawFilePath : path.join(workspaceRoot, rawFilePath)

		// If the file doesn't exist yet, any expected_hash indicates a stale assumption
		if (!(await fileExistsAtPath(absPath))) {
			if (expectedHash !== "") {
				// Agent expected an existing file, but it's gone — that's a stale state
				const errorPayload = buildRejectionError({
					code: "STALE_FILE",
					message: `File '${rawFilePath}' no longer exists. Re-read to verify before writing.`,
					toolName: block.name,
					recoveryHint: `The file you expected to exist at '${rawFilePath}' no longer exists. It may have been deleted by another agent. Check with read_file or list_files and update your approach.`,
				})
				return { blocked: true, errorMessage: errorPayload }
			}
			return { blocked: false }
		}

		// Read current file and hash it
		let currentContent: string
		try {
			currentContent = await fs.readFile(absPath, "utf-8")
		} catch {
			// Can't read → silently pass (avoids blocking on permission errors)
			return { blocked: false }
		}

		const currentHash = hashContent(currentContent)

		if (currentHash !== expectedHash) {
			const relPath = path.isAbsolute(rawFilePath)
				? path.relative(workspaceRoot, rawFilePath).replace(/\\/g, "/")
				: rawFilePath

			const errorPayload = buildRejectionError({
				code: "STALE_FILE",
				message: `File '${relPath}' was modified since you last read it. Your version is stale.`,
				toolName: block.name,
				recoveryHint:
					`Re-read the file '${relPath}' to get the latest content and its current hash, ` +
					`then retry your write using the new content as the base. ` +
					`The current hash is: ${currentHash}`,
			})

			console.warn(
				`[OptimisticLockHook] STALE FILE — expected ${expectedHash.slice(0, 20)}..., got ${currentHash.slice(0, 20)}... for '${relPath}'`,
			)

			return { blocked: true, errorMessage: errorPayload }
		}

		return { blocked: false }
	}

	async onPostExecute(): Promise<void> {
		// No post-execute logic required
	}
}

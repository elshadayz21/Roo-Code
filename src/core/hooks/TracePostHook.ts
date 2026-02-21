import { ToolHook, HookContext, HookResult } from "./ToolHook"
import * as path from "path"
import * as fs from "fs/promises"
import * as crypto from "crypto"
import { getWorkspacePath } from "../../utils/path"
import { fileExistsAtPath } from "../../utils/fs"
import { ToolResponse } from "../../shared/tools"

interface TraceEntry {
	id: string
	timestamp: string
	vcs?: { revision_id: string }
	files?: Array<{
		relative_path: string
		conversations?: Array<{
			url?: string
			contributor?: { entity_type: string; model_identifier?: string }
			ranges?: Array<{
				start_line: number
				end_line: number
				content_hash: string
			}>
			related?: Array<{ type: string; value: string }>
		}>
	}>
}

export class TracePostHook implements ToolHook {
	readonly id = "trace-post-hook"

	private readonly mutatingTools = [
		"write_to_file",
		"apply_diff",
		"edit",
		"search_and_replace",
		"search_replace",
		"edit_file",
		"apply_patch",
	]

	private computeSha256(content: string): string {
		return `sha256:${crypto.createHash("sha256").update(content, "utf8").digest("hex")}`
	}

	async onPreExecute(context: HookContext): Promise<HookResult> {
		return { blocked: false }
	}

	async onPostExecute(context: HookContext, result: ToolResponse): Promise<void> {
		const { task, block } = context

		if (!this.mutatingTools.includes(block.name)) {
			return
		}

		// Only operate if there's an active intent bounding this work
		if (!task.activeIntentId) {
			return
		}

		let relativePath = ""
		let contentToHash = ""
		let startLine = 1
		let endLine = 1

		// Extract target file paths and content from params heuristically
		const params = block.params as Record<string, any>
		const filePath = params.path || params.file_path || ""

		if (!filePath) {
			return
		}

		const workspaceRoot = getWorkspacePath()
		// Try to resolve relative path
		if (path.isAbsolute(filePath)) {
			relativePath = path.relative(workspaceRoot, filePath)
		} else {
			relativePath = filePath
		}

		// Try to extract content to hash
		if (block.name === "write_to_file") {
			contentToHash = params.content || ""
			endLine = contentToHash.split("\n").length
		} else if (params.diff) {
			contentToHash = params.diff
			endLine = contentToHash.split("\n").length
		} else if (params.new_string) {
			contentToHash = params.new_string
			endLine = contentToHash.split("\n").length
		} else if (params.patch) {
			contentToHash = params.patch
			endLine = contentToHash.split("\n").length
		} else {
			// Fallback: we cannot reliably determine the content segment created by this tool
			// So we hash the entire target file if it exists
			try {
				const fullAbsPath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath)
				if (await fileExistsAtPath(fullAbsPath)) {
					contentToHash = await fs.readFile(fullAbsPath, "utf-8")
					endLine = contentToHash.split("\n").length
				}
			} catch (e) {
				console.error("[TracePostHook] Failed to read fallback file content", e)
			}
		}

		if (!contentToHash) {
			return // Nothing to trace
		}

		const contentHash = this.computeSha256(contentToHash)

		const traceEntry: TraceEntry = {
			id: crypto.randomUUID(),
			timestamp: new Date().toISOString(),
			vcs: { revision_id: "unavailable" }, // Alternatively invoke git rev-parse HEAD here if available
			files: [
				{
					relative_path: relativePath,
					conversations: [
						{
							url: task.taskId, // using task id as conversation id proxy
							contributor: {
								entity_type: "AI",
								model_identifier: task.api.getModel().id,
							},
							ranges: [
								{
									start_line: startLine,
									end_line: endLine,
									content_hash: contentHash,
								},
							],
							related: [
								{
									type: "specification",
									value: task.activeIntentId,
								},
							],
						},
					],
				},
			],
		}

		const traceLedgerPath = path.join(workspaceRoot, ".orchestration", "agent_trace.jsonl")

		try {
			// Ensure dir exists
			const dir = path.dirname(traceLedgerPath)
			if (!(await fileExistsAtPath(dir))) {
				await fs.mkdir(dir, { recursive: true })
			}

			const jsonlLine = JSON.stringify(traceEntry) + "\n"
			await fs.appendFile(traceLedgerPath, jsonlLine, "utf-8")
			console.log(
				`[TracePostHook] Written trace entry for ${relativePath} bounded to intent ${task.activeIntentId}`,
			)
		} catch (error) {
			console.error("[TracePostHook] Failed to append trace entry:", error)
		}
	}
}

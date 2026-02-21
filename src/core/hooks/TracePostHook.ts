import * as path from "path"
import * as fs from "fs/promises"
import * as crypto from "crypto"
import { ToolHook, HookContext, HookResult } from "./ToolHook"
import { getWorkspacePath } from "../../utils/path"
import { fileExistsAtPath } from "../../utils/fs"
import { ToolResponse } from "../../shared/tools"
import { hashContent } from "./SpatialHasher"
import { classifyMutation, MutationClass } from "./MutationClassifier"

/**
 * Full Agent Trace entry schema.
 * Matches the specification defined in .orchestration/agent_trace.jsonl.
 */
interface TraceRange {
	start_line: number
	end_line: number
	content_hash: string
	mutation_class: MutationClass
}

interface TraceRelated {
	type: "specification" | "requirement" | "intent"
	value: string
}

interface TraceConversation {
	url?: string
	contributor?: { entity_type: string; model_identifier?: string }
	ranges?: TraceRange[]
	related?: TraceRelated[]
}

interface TraceFile {
	relative_path: string
	conversations?: TraceConversation[]
}

interface TraceEntry {
	id: string
	timestamp: string
	vcs?: { revision_id: string }
	files?: TraceFile[]
}

/**
 * TracePostHook — Phase 1 + Phase 3 enhanced.
 *
 * After every file-mutating tool completes, this hook:
 * 1. Computes a SHA-256 content hash (spatial independence).
 * 2. Classifies the mutation as AST_REFACTOR or INTENT_EVOLUTION.
 * 3. Constructs one TraceEntry per modified file.
 * 4. Injects both the activeIntentId AND any explicit intent_id (REQ-ID)
 *    from the tool params into the `related` array.
 * 5. Appends the entry as a JSONL line to .orchestration/agent_trace.jsonl.
 */
export class TracePostHook implements ToolHook {
	readonly id = "trace-post-hook"

	private readonly mutatingTools = new Set([
		"write_to_file",
		"apply_diff",
		"edit",
		"search_and_replace",
		"search_replace",
		"edit_file",
		"apply_patch",
	])

	async onPreExecute(context: HookContext): Promise<HookResult> {
		return { blocked: false }
	}

	async onPostExecute(context: HookContext, result: ToolResponse): Promise<void> {
		const { task, block } = context

		if (!this.mutatingTools.has(block.name)) {
			return
		}

		if (!task.activeIntentId) {
			return
		}

		const params = block.params as Record<string, any>
		const nativeArgs = (block as any).nativeArgs as Record<string, any> | undefined

		// Prefer nativeArgs (typed) over legacy params for write_to_file
		const filePath: string = nativeArgs?.path ?? params.path ?? params.file_path ?? ""

		if (!filePath) {
			return
		}

		const workspaceRoot = getWorkspacePath()

		const relativePath = path.isAbsolute(filePath)
			? path.relative(workspaceRoot, filePath).replace(/\\/g, "/")
			: filePath.replace(/\\/g, "/")

		// === Extract content for hashing ===
		let contentToHash = ""
		let startLine = 1
		let endLine = 1
		let isNewFile = false

		if (block.name === "write_to_file") {
			contentToHash = nativeArgs?.content ?? params.content ?? ""
			endLine = contentToHash.split("\n").length
			// Detect new file: check if the file existed before this write
			const absPath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath)
			isNewFile = !(await fileExistsAtPath(absPath))
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
			// Fallback: hash the entire file if we can read it
			try {
				const absPath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath)
				if (await fileExistsAtPath(absPath)) {
					contentToHash = await fs.readFile(absPath, "utf-8")
					endLine = contentToHash.split("\n").length
				}
			} catch (e) {
				console.error("[TracePostHook] Failed to read fallback file content", e)
			}
		}

		if (!contentToHash) {
			return
		}

		// === Phase 3: Semantic Classification ===
		const explicitMutationClass = (nativeArgs?.mutation_class ?? params.mutation_class) as
			| "AST_REFACTOR"
			| "INTENT_EVOLUTION"
			| null
			| undefined

		const mutationClass = classifyMutation({
			explicitClass: explicitMutationClass,
			content: contentToHash,
			isNewFile,
		})

		// === Phase 3: REQ-ID injection ===
		// Build the `related` array combining activeIntentId and explicit tool-level intent_id
		const relatedEntries: TraceRelated[] = [
			{
				type: "specification",
				value: task.activeIntentId,
			},
		]

		const explicitIntentId: string | null | undefined = nativeArgs?.intent_id ?? params.intent_id ?? null

		if (explicitIntentId && explicitIntentId !== task.activeIntentId) {
			relatedEntries.push({
				type: "requirement",
				value: explicitIntentId,
			})
		}

		// === Build the full Trace Entry ===
		const traceEntry: TraceEntry = {
			id: crypto.randomUUID(),
			timestamp: new Date().toISOString(),
			vcs: { revision_id: "unavailable" },
			files: [
				{
					relative_path: relativePath,
					conversations: [
						{
							url: task.taskId,
							contributor: {
								entity_type: "AI",
								model_identifier: task.api.getModel().id,
							},
							ranges: [
								{
									start_line: startLine,
									end_line: endLine,
									content_hash: hashContent(contentToHash),
									mutation_class: mutationClass,
								},
							],
							related: relatedEntries,
						},
					],
				},
			],
		}

		// === Append to agent_trace.jsonl ===
		const traceLedgerPath = path.join(workspaceRoot, ".orchestration", "agent_trace.jsonl")

		try {
			const dir = path.dirname(traceLedgerPath)
			if (!(await fileExistsAtPath(dir))) {
				await fs.mkdir(dir, { recursive: true })
			}

			const jsonlLine = JSON.stringify(traceEntry) + "\n"
			await fs.appendFile(traceLedgerPath, jsonlLine, "utf-8")

			console.log(
				`[TracePostHook] Appended trace: ${relativePath} | class=${mutationClass} | hash=${traceEntry.files![0].conversations![0].ranges![0].content_hash.slice(0, 20)}... | intent=${task.activeIntentId}`,
			)
		} catch (error) {
			console.error("[TracePostHook] Failed to append trace entry:", error)
		}
	}
}

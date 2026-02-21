import * as path from "path"
import * as fs from "fs/promises"
import { Task } from "../task/Task"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { getWorkspacePath } from "../../utils/path"
import { fileExistsAtPath } from "../../utils/fs"
import type { NativeToolArgs } from "../../shared/tools"

type RecordLessonParams = NativeToolArgs["record_lesson"]

const LESSONS_SECTION_HEADER = "## Lessons Learned"

const TRIGGER_LABELS: Record<RecordLessonParams["trigger"], string> = {
	test_failure: "🔴 Test Failure",
	lint_failure: "🟡 Lint Failure",
	agent_correction: "🔵 Agent Correction",
	user_feedback: "🟢 User Feedback",
}

/**
 * RecordLessonTool — Phase 4 self-improvement recording.
 *
 * Appends a timestamped lesson to the `## Lessons Learned` section
 * of CLAUDE.md in the workspace root. This section is automatically
 * created if it does not exist.
 *
 * Trigger types:
 *   - test_failure: a unit test or integration test failed
 *   - lint_failure: a linter or type-checker reported errors
 *   - agent_correction: the agent made a mistake and self-corrected
 *   - user_feedback: the user explicitly pointed out an error or preference
 *
 * Lessons persist across sessions, building a project-specific knowledge
 * base that helps future agents avoid repeating the same mistakes.
 */
export class RecordLessonTool extends BaseTool<"record_lesson"> {
	readonly name = "record_lesson" as const

	async execute(params: RecordLessonParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { lesson, trigger } = params

		if (!lesson || lesson.trim() === "") {
			await callbacks.handleError("record_lesson", new Error("'lesson' cannot be empty."))
			return
		}

		const workspaceRoot = getWorkspacePath()
		const claudeMdPath = path.join(workspaceRoot, "CLAUDE.md")

		const timestamp = new Date().toISOString().split("T")[0] // YYYY-MM-DD
		const triggerLabel = TRIGGER_LABELS[trigger] ?? trigger
		const bullet = `- [${timestamp}] [${triggerLabel}] ${lesson.trim()}`

		try {
			let content = ""

			if (await fileExistsAtPath(claudeMdPath)) {
				content = await fs.readFile(claudeMdPath, "utf-8")
			} else {
				// Bootstrap CLAUDE.md with a minimal header
				content = `# CLAUDE.md — Project Intelligence\n\nThis file is maintained by AI agents to record lessons and project conventions.\n\n`
			}

			if (content.includes(LESSONS_SECTION_HEADER)) {
				// Append bullet directly under the section header
				content = content.replace(LESSONS_SECTION_HEADER, `${LESSONS_SECTION_HEADER}\n${bullet}`)
			} else {
				// Add the section at the end
				const separator = content.endsWith("\n\n") ? "" : content.endsWith("\n") ? "\n" : "\n\n"
				content += `${separator}${LESSONS_SECTION_HEADER}\n${bullet}\n`
			}

			await fs.writeFile(claudeMdPath, content, "utf-8")

			console.log(`[RecordLessonTool] Recorded lesson (${trigger}): ${lesson.trim().slice(0, 60)}...`)

			await callbacks.pushToolResult(
				`✅ Lesson recorded in CLAUDE.md under '${LESSONS_SECTION_HEADER}':\n\n${bullet}`,
			)
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error))
			console.error("[RecordLessonTool] Failed to write CLAUDE.md:", error)
			await callbacks.handleError("record_lesson: failed to write CLAUDE.md", err)
		}
	}
}

export const recordLessonTool = new RecordLessonTool()

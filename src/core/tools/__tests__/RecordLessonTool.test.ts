import { vi, describe, it, expect, beforeEach, afterEach } from "vitest"
import { RecordLessonTool } from "../RecordLessonTool"
import * as fs from "fs/promises"
import { getWorkspacePath } from "../../../utils/path"
import { fileExistsAtPath } from "../../../utils/fs"

vi.mock("fs/promises")
vi.mock("../../../utils/path")
vi.mock("../../../utils/fs")

const workspaceRoot = "/mock/workspace"

const makeCallbacks = () => {
	const pushToolResult = vi.fn().mockResolvedValue(undefined)
	const handleError = vi.fn().mockResolvedValue(undefined)
	const askApproval = vi.fn()
	return { pushToolResult, handleError, askApproval }
}

describe("RecordLessonTool", () => {
	let tool: RecordLessonTool
	let mockTask: any

	beforeEach(() => {
		vi.clearAllMocks()
		tool = new RecordLessonTool()
		mockTask = { taskId: "task-1" }

		vi.mocked(getWorkspacePath).mockReturnValue(workspaceRoot)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("should create CLAUDE.md if it does not exist", async () => {
		vi.mocked(fileExistsAtPath).mockResolvedValue(false)
		const cbs = makeCallbacks()

		await tool.execute(
			{ lesson: "Never mutate shared state without locking", trigger: "test_failure" },
			mockTask,
			cbs,
		)

		expect(fs.writeFile).toHaveBeenCalledWith(
			expect.stringContaining("CLAUDE.md"),
			expect.stringContaining("## Lessons Learned"),
			"utf-8",
		)
		expect(cbs.pushToolResult).toHaveBeenCalledWith(expect.stringContaining("Lesson recorded"))
	})

	it("should append to existing ## Lessons Learned section", async () => {
		const existingContent = "# CLAUDE.md\n\n## Lessons Learned\n- [2026-01-01] [🔴 Test Failure] Old lesson\n"
		vi.mocked(fileExistsAtPath).mockResolvedValue(true)
		vi.mocked(fs.readFile).mockResolvedValue(existingContent)
		const cbs = makeCallbacks()

		await tool.execute({ lesson: "Always use vitest for unit tests", trigger: "lint_failure" }, mockTask, cbs)

		const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string
		expect(writtenContent).toContain("Always use vitest for unit tests")
		expect(writtenContent).toContain("Old lesson")
		expect(writtenContent).toContain("🟡 Lint Failure")
	})

	it("should add ## Lessons Learned section if it does not exist in existing file", async () => {
		const existingContent = "# CLAUDE.md\n\nSome existing content.\n"
		vi.mocked(fileExistsAtPath).mockResolvedValue(true)
		vi.mocked(fs.readFile).mockResolvedValue(existingContent)
		const cbs = makeCallbacks()

		await tool.execute({ lesson: "Use descriptive commit messages", trigger: "user_feedback" }, mockTask, cbs)

		const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string
		expect(writtenContent).toContain("## Lessons Learned")
		expect(writtenContent).toContain("Use descriptive commit messages")
		expect(writtenContent).toContain("🟢 User Feedback")
	})

	it("should handle errors gracefully via handleError callback", async () => {
		vi.mocked(fileExistsAtPath).mockResolvedValue(false)
		vi.mocked(fs.writeFile).mockRejectedValue(new Error("disk full"))
		const cbs = makeCallbacks()

		await tool.execute({ lesson: "This will fail", trigger: "agent_correction" }, mockTask, cbs)

		expect(cbs.handleError).toHaveBeenCalledWith(expect.stringContaining("record_lesson"), expect.any(Error))
		expect(cbs.pushToolResult).not.toHaveBeenCalled()
	})

	it("should call handleError for empty lesson", async () => {
		const cbs = makeCallbacks()
		await tool.execute({ lesson: "  ", trigger: "test_failure" }, mockTask, cbs)
		expect(cbs.handleError).toHaveBeenCalled()
		expect(fs.writeFile).not.toHaveBeenCalled()
	})
})

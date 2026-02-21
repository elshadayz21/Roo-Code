import { vi, describe, it, expect, beforeEach, afterEach } from "vitest"
import { TracePostHook } from "../TracePostHook"
import * as fs from "fs/promises"
import * as path from "path"
import * as crypto from "crypto"
import { getWorkspacePath } from "../../../utils/path"
import { fileExistsAtPath } from "../../../utils/fs"

vi.mock("fs/promises")
vi.mock("../../../utils/path")
vi.mock("../../../utils/fs")

describe("TracePostHook", () => {
	let hook: TracePostHook
	let mockContext: any
	let mockTask: any
	const workspaceRoot = "/mock/workspace"

	beforeEach(() => {
		vi.clearAllMocks()
		hook = new TracePostHook()

		mockTask = {
			activeIntentId: "INT-001",
			taskId: "task-123",
			api: {
				getModel: () => ({ id: "mock-model" }),
			},
		}

		mockContext = {
			task: mockTask,
			block: {
				name: "write_to_file",
				params: {
					path: "src/test.ts",
					content: "export const dummy = true;\n",
				},
			},
		}

		vi.mocked(getWorkspacePath).mockReturnValue(workspaceRoot)
		// File does not exist yet for directory checks
		vi.mocked(fileExistsAtPath).mockResolvedValue(false)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("should successfully append trace entry for write_to_file", async () => {
		await hook.onPostExecute(mockContext, "")

		expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining(".orchestration"), { recursive: true })

		// Ensure appendFile was called and parsed as JSON
		const appendCallArg = vi.mocked(fs.appendFile).mock.calls[0][1] as string
		const parsedEntry = JSON.parse(appendCallArg.trim())

		expect(parsedEntry.id).toBeDefined()
		expect(parsedEntry.timestamp).toBeDefined()
		expect(parsedEntry.files[0].relative_path).toBe("src/test.ts")
		expect(parsedEntry.files[0].conversations[0].url).toBe("task-123")
		expect(parsedEntry.files[0].conversations[0].contributor.model_identifier).toBe("mock-model")
		expect(parsedEntry.files[0].conversations[0].ranges[0].content_hash).toMatch(/^sha256:/)
		expect(parsedEntry.files[0].conversations[0].related[0].value).toBe("INT-001")
		expect(parsedEntry.files[0].conversations[0].ranges[0].start_line).toBe(1)
		expect(parsedEntry.files[0].conversations[0].ranges[0].end_line).toBe(2)
	})

	it("should compute correct end_line for apply_diff", async () => {
		mockContext.block.name = "apply_diff"
		mockContext.block.params = {
			path: "src/diff.ts",
			diff: "<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE",
		}
		await hook.onPostExecute(mockContext, "")

		const appendCallArg = vi.mocked(fs.appendFile).mock.calls[0][1] as string
		const parsedEntry = JSON.parse(appendCallArg.trim())

		expect(parsedEntry.files[0].conversations[0].ranges[0].end_line).toBe(5) // length of diff content string
	})

	it("should not append if tool is not a mutator", async () => {
		mockContext.block.name = "read_file"
		await hook.onPostExecute(mockContext, "")
		expect(fs.appendFile).not.toHaveBeenCalled()
	})

	it("should not append if no active intent exists", async () => {
		mockTask.activeIntentId = undefined
		await hook.onPostExecute(mockContext, "")
		expect(fs.appendFile).not.toHaveBeenCalled()
	})
})

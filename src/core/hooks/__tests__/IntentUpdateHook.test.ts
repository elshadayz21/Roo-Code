import { vi, describe, it, expect, beforeEach, afterEach } from "vitest"
import { IntentUpdateHook } from "../IntentUpdateHook"
import * as fs from "fs/promises"
import * as path from "path"
import { getWorkspacePath } from "../../../utils/path"
import { fileExistsAtPath } from "../../../utils/fs"

vi.mock("fs/promises")
vi.mock("../../../utils/path")
vi.mock("../../../utils/fs")

describe("IntentUpdateHook", () => {
	let hook: IntentUpdateHook
	let mockContext: any
	let mockTask: any
	const workspaceRoot = "/mock/workspace"

	beforeEach(() => {
		vi.clearAllMocks()
		hook = new IntentUpdateHook()

		mockTask = {
			activeIntentId: "INT-001",
		}

		mockContext = {
			task: mockTask,
			block: {
				name: "select_active_intent",
			},
		}

		vi.mocked(getWorkspacePath).mockReturnValue(workspaceRoot)
		vi.mocked(fileExistsAtPath).mockResolvedValue(true)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("should update intent status to IN_PROGRESS on select_active_intent", async () => {
		const yamlContent = `
active_intents:
  - id: "INT-001"
    status: "TODO"
`
		vi.mocked(fs.readFile).mockResolvedValue(yamlContent)

		await hook.onPostExecute(mockContext, "")

		expect(fs.writeFile).toHaveBeenCalledWith(
			expect.stringContaining("active_intents.yaml"),
			expect.stringContaining("status: IN_PROGRESS"),
			"utf-8",
		)
	})

	it("should update intent status to COMPLETED on attempt_completion", async () => {
		mockContext.block.name = "attempt_completion"
		const yamlContent = `
active_intents:
  - id: "INT-001"
    status: "IN_PROGRESS"
`
		vi.mocked(fs.readFile).mockResolvedValue(yamlContent)

		await hook.onPostExecute(mockContext, "")

		expect(fs.writeFile).toHaveBeenCalledWith(
			expect.stringContaining("active_intents.yaml"),
			expect.stringContaining("status: COMPLETED"),
			"utf-8",
		)
	})

	it("should not update file if status already matches", async () => {
		const yamlContent = `
active_intents:
  - id: "INT-001"
    status: "IN_PROGRESS"
`
		vi.mocked(fs.readFile).mockResolvedValue(yamlContent)

		await hook.onPostExecute(mockContext, "")

		expect(fs.writeFile).not.toHaveBeenCalled()
	})

	it("should skip if no activeIntentId on task", async () => {
		mockTask.activeIntentId = undefined
		await hook.onPostExecute(mockContext, "")
		expect(fs.readFile).not.toHaveBeenCalled()
	})

	it("should skip if tool is not select_active_intent or attempt_completion", async () => {
		mockContext.block.name = "write_to_file"
		await hook.onPostExecute(mockContext, "")
		expect(fs.readFile).not.toHaveBeenCalled()
	})
})

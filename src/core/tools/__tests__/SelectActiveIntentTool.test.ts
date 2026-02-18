import * as fs from "fs/promises"
import * as path from "path"
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest"
import { SelectActiveIntentTool } from "../SelectActiveIntentTool"
import { getWorkspacePath } from "../../../utils/path"
import { fileExistsAtPath } from "../../../utils/fs"

// Mock dependencies
vi.mock("fs/promises")
vi.mock("../../../utils/path")
vi.mock("../../../utils/fs")

describe("SelectActiveIntentTool", () => {
	let tool: SelectActiveIntentTool
	let mockTask: any
	let mockCallbacks: any
	const workspaceRoot = "/mock/workspace"

	beforeEach(() => {
		vi.clearAllMocks()
		tool = new SelectActiveIntentTool()

		mockTask = {
			consecutiveMistakeCount: 0,
			didToolFailInCurrentTurn: false,
			say: vi.fn().mockResolvedValue(undefined),
			recordToolError: vi.fn(),
			sayAndCreateMissingParamError: vi.fn(),
		}

		mockCallbacks = {
			pushToolResult: vi.fn(),
			handleError: vi.fn(),
		}

		vi.mocked(getWorkspacePath).mockReturnValue(workspaceRoot)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("should successfully select an active intent and return XML context", async () => {
		const intentId = "INT-001"
		const yamlContent = `
active_intents:
  - id: "INT-001"
    name: "Test Intent"
    status: "IN_PROGRESS"
    owned_scope:
      - "src/**"
    constraints:
      - "Constraint 1"
    acceptance_criteria:
      - "Criteria 1"
`
		vi.mocked(fileExistsAtPath).mockResolvedValue(true)
		vi.mocked(fs.readFile).mockResolvedValue(yamlContent)

		await tool.execute({ intent_id: intentId }, mockTask, mockCallbacks)

		expect(mockTask.say).toHaveBeenCalledWith("text", expect.stringContaining(`[Intent Selected: ${intentId}]`))
		expect(mockTask.say).toHaveBeenCalledWith("text", expect.stringContaining("Test Intent"))

		// Check for XML output
		const pushedResult = mockCallbacks.pushToolResult.mock.calls[0][0]
		expect(pushedResult).toContain("<intent_context>")
		expect(pushedResult).toContain("<intent_id>INT-001</intent_id>")
		expect(pushedResult).toContain("<constraint>Constraint 1</constraint>")
		expect(pushedResult).toContain("<path>src/**</path>")
		expect(pushedResult).toContain("<criterion>Criteria 1</criterion>")

		// Check task state
		expect(mockTask.activeIntentId).toBe(intentId)
		expect(mockTask.consecutiveMistakeCount).toBe(0)
	})

	it("should report an error if intent ID is not found", async () => {
		const intentId = "INT-999"
		const yamlContent = `
active_intents:
  - id: "INT-001"
`
		vi.mocked(fileExistsAtPath).mockResolvedValue(true)
		vi.mocked(fs.readFile).mockResolvedValue(yamlContent)

		await tool.execute({ intent_id: intentId }, mockTask, mockCallbacks)

		expect(mockTask.recordToolError).toHaveBeenCalledWith("select_active_intent")
		expect(mockTask.didToolFailInCurrentTurn).toBe(true)
		expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith(
			expect.stringContaining(`Error: Intent ID "${intentId}" not found`),
		)
		expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith(expect.stringContaining("Available IDs: INT-001"))
	})

	it("should report an error if orchestration file is missing", async () => {
		vi.mocked(fileExistsAtPath).mockResolvedValue(false)

		await tool.execute({ intent_id: "INT-001" }, mockTask, mockCallbacks)

		expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith(
			expect.stringContaining("Error: Orchestration file not found"),
		)
	})

	it("should report an error if YAML parsing fails", async () => {
		vi.mocked(fileExistsAtPath).mockResolvedValue(true)
		vi.mocked(fs.readFile).mockResolvedValue("invalid: yaml: [")

		await tool.execute({ intent_id: "INT-001" }, mockTask, mockCallbacks)

		expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith(
			expect.stringContaining("Error: Failed to parse orchestration YAML"),
		)
	})
})

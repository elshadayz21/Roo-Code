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
		// First call: active_intents.yaml, Second call: agent_trace.jsonl (not found)
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

	it("should include related agent trace entries in the XML context", async () => {
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
		const traceJsonl = `{"id":"trace-001","timestamp":"2026-02-18T14:08:30Z","vcs":{"revision_id":"abc123"},"files":[{"relative_path":"src/auth/middleware.ts","conversations":[{"url":"session_1","contributor":{"entity_type":"AI"},"ranges":[{"start_line":15,"end_line":45,"content_hash":"sha256:abc123"}],"related":[{"type":"specification","value":"REQ-001"}]}]}]}`

		vi.mocked(fileExistsAtPath).mockResolvedValue(true)
		vi.mocked(fs.readFile)
			.mockResolvedValueOnce(yamlContent) // active_intents.yaml
			.mockResolvedValueOnce(traceJsonl) // agent_trace.jsonl

		await tool.execute({ intent_id: intentId }, mockTask, mockCallbacks)

		const pushedResult = mockCallbacks.pushToolResult.mock.calls[0][0]
		expect(pushedResult).toContain("<agent_trace_history>")
		expect(pushedResult).toContain('trace id="trace-001"')
		expect(pushedResult).toContain('path="src/auth/middleware.ts"')
		expect(pushedResult).toContain('hash="sha256:abc123"')

		// Check the say message includes trace count
		expect(mockTask.say).toHaveBeenCalledWith("text", expect.stringContaining("1 prior trace entries loaded"))
	})

	it("should handle missing agent_trace.jsonl gracefully", async () => {
		const intentId = "INT-001"
		const yamlContent = `
active_intents:
  - id: "INT-001"
    name: "Test Intent"
    status: "IN_PROGRESS"
`
		// fileExistsAtPath: true for YAML, false for JSONL
		vi.mocked(fileExistsAtPath)
			.mockResolvedValueOnce(true) // active_intents.yaml
			.mockResolvedValueOnce(false) // agent_trace.jsonl
		vi.mocked(fs.readFile).mockResolvedValue(yamlContent)

		await tool.execute({ intent_id: intentId }, mockTask, mockCallbacks)

		const pushedResult = mockCallbacks.pushToolResult.mock.calls[0][0]
		expect(pushedResult).toContain("<intent_context>")
		expect(pushedResult).not.toContain("<agent_trace_history>")
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

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest"
import { AuthorizationHook } from "../AuthorizationHook"
import * as fs from "fs/promises"
import { getWorkspacePath } from "../../../utils/path"
import { fileExistsAtPath } from "../../../utils/fs"

// Mock VS Code API
vi.mock("vscode", () => ({
	window: {
		showWarningMessage: vi.fn(),
	},
}))

vi.mock("fs/promises")
vi.mock("../../../utils/path")
vi.mock("../../../utils/fs")

import * as vscode from "vscode"

const workspaceRoot = "/mock/workspace"

describe("AuthorizationHook", () => {
	let hook: AuthorizationHook
	let mockContext: any

	beforeEach(() => {
		vi.clearAllMocks()
		hook = new AuthorizationHook()

		mockContext = {
			task: { activeIntentId: "INT-001", taskId: "task-1" },
			block: {
				name: "write_to_file",
				params: { path: "src/test.ts" },
			},
		}

		vi.mocked(getWorkspacePath).mockReturnValue(workspaceRoot)
		vi.mocked(fileExistsAtPath).mockResolvedValue(false) // no .intentignore by default
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("should allow SAFE tools without showing dialog", async () => {
		mockContext.block.name = "read_file"
		const result = await hook.onPreExecute(mockContext)
		expect(result.blocked).toBe(false)
		expect(vscode.window.showWarningMessage).not.toHaveBeenCalled()
	})

	it("should show approval dialog for DESTRUCTIVE tools", async () => {
		vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("Approve" as any)
		const result = await hook.onPreExecute(mockContext)
		expect(vscode.window.showWarningMessage).toHaveBeenCalled()
		expect(result.blocked).toBe(false)
	})

	it("should block and return JSON error when developer rejects", async () => {
		vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("Reject" as any)
		const result = await hook.onPreExecute(mockContext)
		expect(result.blocked).toBe(true)
		const parsed = JSON.parse(result.errorMessage!)
		expect(parsed.error).toBe("TOOL_REJECTED")
		expect(parsed.code).toBe("USER_REJECTED_INTENT_EVOLUTION")
	})

	it("should bypass dialog for intents listed in .intentignore", async () => {
		vi.mocked(fileExistsAtPath).mockResolvedValue(true)
		vi.mocked(fs.readFile).mockResolvedValue("# bypass list\nINT-001\nINT-002\n")
		hook.invalidateCache()
		const result = await hook.onPreExecute(mockContext)
		expect(result.blocked).toBe(false)
		expect(vscode.window.showWarningMessage).not.toHaveBeenCalled()
	})

	it("should NOT bypass intents NOT in .intentignore", async () => {
		vi.mocked(fileExistsAtPath).mockResolvedValue(true)
		vi.mocked(fs.readFile).mockResolvedValue("INT-999\n")
		hook.invalidateCache()
		vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("Approve" as any)
		const result = await hook.onPreExecute(mockContext)
		expect(vscode.window.showWarningMessage).toHaveBeenCalled()
		expect(result.blocked).toBe(false)
	})
})

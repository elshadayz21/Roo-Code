import { vi, describe, it, expect, beforeEach, afterEach } from "vitest"
import { ScopeEnforcementHook } from "../ScopeEnforcementHook"
import * as fs from "fs/promises"
import { getWorkspacePath } from "../../../utils/path"
import { fileExistsAtPath } from "../../../utils/fs"

vi.mock("fs/promises")
vi.mock("../../../utils/path")
vi.mock("../../../utils/fs")

const workspaceRoot = "/mock/workspace"

const makeYaml = (scope: string[]) => `
active_intents:
  - id: "INT-001"
    status: "IN_PROGRESS"
    owned_scope:
${scope.map((s) => `      - "${s}"`).join("\n")}
`

describe("ScopeEnforcementHook", () => {
	let hook: ScopeEnforcementHook
	let mockContext: any

	beforeEach(() => {
		vi.clearAllMocks()
		hook = new ScopeEnforcementHook()

		mockContext = {
			task: { activeIntentId: "INT-001", taskId: "task-1" },
			block: {
				name: "write_to_file",
				params: { path: "src/auth/login.ts" },
			},
		}

		vi.mocked(getWorkspacePath).mockReturnValue(workspaceRoot)
		vi.mocked(fileExistsAtPath).mockResolvedValue(true)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("should allow writes within owned_scope glob", async () => {
		vi.mocked(fs.readFile).mockResolvedValue(makeYaml(["src/auth/**"]))
		const result = await hook.onPreExecute(mockContext)
		expect(result.blocked).toBe(false)
	})

	it("should block writes outside owned_scope and return JSON SCOPE_VIOLATION", async () => {
		vi.mocked(fs.readFile).mockResolvedValue(makeYaml(["src/payments/**"]))
		const result = await hook.onPreExecute(mockContext)
		expect(result.blocked).toBe(true)
		const parsed = JSON.parse(result.errorMessage!)
		expect(parsed.error).toBe("TOOL_REJECTED")
		expect(parsed.code).toBe("SCOPE_VIOLATION")
		expect(result.errorMessage).toContain("not authorized to edit")
		expect(result.errorMessage).toContain("src/auth/login.ts")
	})

	it("should pass through non-write tools without checking scope", async () => {
		mockContext.block.name = "read_file"
		const result = await hook.onPreExecute(mockContext)
		expect(result.blocked).toBe(false)
		expect(fs.readFile).not.toHaveBeenCalled()
	})

	it("should pass through if no activeIntentId", async () => {
		mockContext.task.activeIntentId = undefined
		const result = await hook.onPreExecute(mockContext)
		expect(result.blocked).toBe(false)
	})

	it("should pass through if intent has no owned_scope", async () => {
		vi.mocked(fs.readFile).mockResolvedValue(`
active_intents:
  - id: "INT-001"
    status: "IN_PROGRESS"
`)
		const result = await hook.onPreExecute(mockContext)
		expect(result.blocked).toBe(false)
	})

	it("should allow exact path matches in scope", async () => {
		vi.mocked(fs.readFile).mockResolvedValue(makeYaml(["src/auth/login.ts"]))
		const result = await hook.onPreExecute(mockContext)
		expect(result.blocked).toBe(false)
	})

	it("should allow apply_diff within scope", async () => {
		mockContext.block.name = "apply_diff"
		vi.mocked(fs.readFile).mockResolvedValue(makeYaml(["src/auth/**"]))
		const result = await hook.onPreExecute(mockContext)
		expect(result.blocked).toBe(false)
	})
})

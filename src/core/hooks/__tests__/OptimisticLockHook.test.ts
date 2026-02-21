import { vi, describe, it, expect, beforeEach, afterEach } from "vitest"
import { OptimisticLockHook } from "../OptimisticLockHook"
import * as fs from "fs/promises"
import { getWorkspacePath } from "../../../utils/path"
import { fileExistsAtPath } from "../../../utils/fs"

vi.mock("fs/promises")
vi.mock("../../../utils/path")
vi.mock("../../../utils/fs")

const workspaceRoot = "/mock/workspace"

describe("OptimisticLockHook", () => {
	let hook: OptimisticLockHook
	let mockContext: any

	beforeEach(() => {
		vi.clearAllMocks()
		hook = new OptimisticLockHook()

		mockContext = {
			task: { activeIntentId: "INT-001", taskId: "task-1" },
			block: {
				name: "write_to_file",
				params: { path: "src/auth/login.ts", expected_hash: null },
				nativeArgs: null,
			},
		}

		vi.mocked(getWorkspacePath).mockReturnValue(workspaceRoot)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("should pass through if no expected_hash provided", async () => {
		const result = await hook.onPreExecute(mockContext)
		expect(result.blocked).toBe(false)
		expect(fs.readFile).not.toHaveBeenCalled()
	})

	it("should pass through for non-write tools even with expected_hash", async () => {
		mockContext.block.name = "read_file"
		mockContext.block.params.expected_hash = "sha256:abc"
		const result = await hook.onPreExecute(mockContext)
		expect(result.blocked).toBe(false)
		expect(fs.readFile).not.toHaveBeenCalled()
	})

	it("should pass through when hashes match (fresh file)", async () => {
		const content = "export const foo = 1\n"
		// Compute expected hash the same way the hook does
		const { hashContent } = await import("../SpatialHasher")
		const expectedHash = hashContent(content)

		mockContext.block.params.expected_hash = expectedHash
		vi.mocked(fileExistsAtPath).mockResolvedValue(true)
		vi.mocked(fs.readFile).mockResolvedValue(content)

		const result = await hook.onPreExecute(mockContext)
		expect(result.blocked).toBe(false)
	})

	it("should block with STALE_FILE when hashes differ", async () => {
		mockContext.block.params.expected_hash =
			"sha256:0000000000000000000000000000000000000000000000000000000000000000"
		vi.mocked(fileExistsAtPath).mockResolvedValue(true)
		vi.mocked(fs.readFile).mockResolvedValue("export const foo = 42\n") // different content

		const result = await hook.onPreExecute(mockContext)
		expect(result.blocked).toBe(true)
		const parsed = JSON.parse(result.errorMessage!)
		expect(parsed.error).toBe("TOOL_REJECTED")
		expect(parsed.code).toBe("STALE_FILE")
		expect(result.errorMessage).toContain("re-read")
	})

	it("should block when file gone but non-empty expected_hash provided", async () => {
		mockContext.block.params.expected_hash = "sha256:abc"
		vi.mocked(fileExistsAtPath).mockResolvedValue(false)

		const result = await hook.onPreExecute(mockContext)
		expect(result.blocked).toBe(true)
		const parsed = JSON.parse(result.errorMessage!)
		expect(parsed.code).toBe("STALE_FILE")
	})

	it("should pass through if file doesn't exist and expected_hash is empty string", async () => {
		mockContext.block.params.expected_hash = ""
		vi.mocked(fileExistsAtPath).mockResolvedValue(false)

		const result = await hook.onPreExecute(mockContext)
		expect(result.blocked).toBe(false)
	})
})

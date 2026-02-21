import { vi, describe, it, expect } from "vitest"
import { classifyCommand, buildRejectionError, SAFE_TOOLS, DESTRUCTIVE_TOOLS } from "../CommandClassifier"

describe("CommandClassifier", () => {
	describe("classifyCommand", () => {
		it("should classify read tools as SAFE", () => {
			expect(classifyCommand("read_file")).toBe("SAFE")
			expect(classifyCommand("list_files")).toBe("SAFE")
			expect(classifyCommand("search_files")).toBe("SAFE")
			expect(classifyCommand("codebase_search")).toBe("SAFE")
			expect(classifyCommand("select_active_intent")).toBe("SAFE")
		})

		it("should classify write/exec tools as DESTRUCTIVE", () => {
			expect(classifyCommand("write_to_file")).toBe("DESTRUCTIVE")
			expect(classifyCommand("apply_diff")).toBe("DESTRUCTIVE")
			expect(classifyCommand("execute_command")).toBe("DESTRUCTIVE")
			expect(classifyCommand("edit")).toBe("DESTRUCTIVE")
			expect(classifyCommand("new_task")).toBe("DESTRUCTIVE")
		})

		it("should classify unknown tools as UNKNOWN", () => {
			expect(classifyCommand("some_made_up_tool")).toBe("UNKNOWN")
		})
	})

	describe("buildRejectionError", () => {
		it("should produce valid JSON with all required fields", () => {
			const payload = buildRejectionError({
				code: "USER_REJECTED_INTENT_EVOLUTION",
				message: "Developer rejected write_to_file",
				toolName: "write_to_file",
				intentId: "INT-001",
			})

			const parsed = JSON.parse(payload)
			expect(parsed.error).toBe("TOOL_REJECTED")
			expect(parsed.code).toBe("USER_REJECTED_INTENT_EVOLUTION")
			expect(parsed.tool).toBe("write_to_file")
			expect(parsed.intent_id).toBe("INT-001")
			expect(parsed.message).toBeDefined()
			expect(parsed.recovery_hint).toBeDefined()
		})

		it("should set intent_id to null when not provided", () => {
			const payload = buildRejectionError({
				code: "SCOPE_VIOLATION",
				message: "Out of scope",
				toolName: "apply_diff",
			})
			const parsed = JSON.parse(payload)
			expect(parsed.intent_id).toBeNull()
		})

		it("should use custom recoveryHint when provided", () => {
			const payload = buildRejectionError({
				code: "X",
				message: "msg",
				toolName: "edit",
				recoveryHint: "My custom hint",
			})
			expect(JSON.parse(payload).recovery_hint).toBe("My custom hint")
		})
	})
})

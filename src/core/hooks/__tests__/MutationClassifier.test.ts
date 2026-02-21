import { describe, it, expect } from "vitest"
import { classifyMutation } from "../MutationClassifier"

describe("MutationClassifier", () => {
	it("should respect explicit AST_REFACTOR class from LLM", () => {
		const result = classifyMutation({
			explicitClass: "AST_REFACTOR",
			content: "export async function newFeature() { return true }",
		})
		expect(result).toBe("AST_REFACTOR")
	})

	it("should respect explicit INTENT_EVOLUTION class from LLM", () => {
		const result = classifyMutation({
			explicitClass: "INTENT_EVOLUTION",
			content: "// just a comment",
		})
		expect(result).toBe("INTENT_EVOLUTION")
	})

	it("should classify new files as INTENT_EVOLUTION regardless of content", () => {
		const result = classifyMutation({
			content: "// a comment\nimport foo from './foo'",
			isNewFile: true,
		})
		expect(result).toBe("INTENT_EVOLUTION")
	})

	it("should detect new function definitions as INTENT_EVOLUTION", () => {
		const result = classifyMutation({
			content: "+async function handleLogin(req: Request) {\n+  return true\n+}",
		})
		expect(result).toBe("INTENT_EVOLUTION")
	})

	it("should detect new class definitions as INTENT_EVOLUTION", () => {
		const result = classifyMutation({
			content: "+export class AuthService {\n+  constructor() {}\n+}",
		})
		expect(result).toBe("INTENT_EVOLUTION")
	})

	it("should detect route definitions as INTENT_EVOLUTION", () => {
		const result = classifyMutation({
			content: "+app.post('/api/login', loginHandler)",
		})
		expect(result).toBe("INTENT_EVOLUTION")
	})

	it("should classify pure import changes as AST_REFACTOR", () => {
		const result = classifyMutation({
			content: [
				"-import { foo } from './foo'",
				"+import { bar } from './bar'",
				"// just reorganizing imports",
			].join("\n"),
		})
		expect(result).toBe("AST_REFACTOR")
	})

	it("should default to INTENT_EVOLUTION for ambiguous content", () => {
		const result = classifyMutation({
			content: "const x = 1 + 2",
		})
		expect(result).toBe("INTENT_EVOLUTION")
	})

	it("should handle null explicit class (same as undefined)", () => {
		const result = classifyMutation({
			explicitClass: null,
			content: "+export function myNewApi() {}",
		})
		expect(result).toBe("INTENT_EVOLUTION")
	})
})

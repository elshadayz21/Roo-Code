import { describe, it, expect } from "vitest"
import { hashContent, hashLines, verifyHash } from "../SpatialHasher"

describe("SpatialHasher", () => {
	it("should return sha256-prefixed hex string", () => {
		const result = hashContent("hello world")
		expect(result).toMatch(/^sha256:[a-f0-9]{64}$/)
	})

	it("should produce stable hashes for the same content", () => {
		const a = hashContent("export const foo = 1")
		const b = hashContent("export const foo = 1")
		expect(a).toBe(b)
	})

	it("should produce different hashes for different content", () => {
		const a = hashContent("export const foo = 1")
		const b = hashContent("export const bar = 2")
		expect(a).not.toBe(b)
	})

	it("hashLines should join lines and hash consistently", () => {
		const lines = ["line one", "line two", "line three"]
		const fromLines = hashLines(lines)
		const fromJoined = hashContent(lines.join("\n"))
		expect(fromLines).toBe(fromJoined)
	})

	it("verifyHash should return true for matching content", () => {
		const content = "const x = 42"
		const hash = hashContent(content)
		expect(verifyHash(content, hash)).toBe(true)
	})

	it("verifyHash should return false for tampered content", () => {
		const hash = hashContent("original content")
		expect(verifyHash("tampered content", hash)).toBe(false)
	})

	it("should produce canonical sha256: prefix format as per agent_trace spec", () => {
		const hash = hashContent("test")
		expect(hash.startsWith("sha256:")).toBe(true)
		expect(hash.length).toBe(7 + 64) // "sha256:" + 64 hex chars
	})
})

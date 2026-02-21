import * as crypto from "crypto"

/**
 * SpatialHasher — a standalone SHA-256 content hashing utility.
 *
 * Used by TracePostHook (and any future trace consumer) to produce
 * content-addressable identifiers for code blocks.
 *
 * The "sha256:" prefix is the canonical format used in agent_trace.jsonl:
 *   { "content_hash": "sha256:a8f5f167f44f4964..." }
 *
 * Spatial independence guarantee: the hash is computed from the *content*
 * of the code block, not its line numbers. If lines shift up or down due
 * to file edits elsewhere, previously recorded hashes remain valid.
 */

const HASH_PREFIX = "sha256:"

/**
 * Computes the SHA-256 hash of a string and returns it in the
 * canonical `sha256:<hex>` format.
 */
export function hashContent(content: string): string {
	return HASH_PREFIX + crypto.createHash("sha256").update(content, "utf8").digest("hex")
}

/**
 * Computes the SHA-256 hash over an array of lines joined by newline.
 * Convenient when the caller already has lines split from file content.
 */
export function hashLines(lines: string[]): string {
	return hashContent(lines.join("\n"))
}

/**
 * Verifies that a previously recorded hash still matches the given content.
 * Used for integrity checks when re-reading traced files.
 */
export function verifyHash(content: string, expectedHash: string): boolean {
	return hashContent(content) === expectedHash
}

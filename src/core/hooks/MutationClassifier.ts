/**
 * MutationClassifier — semantic classification of code mutations.
 *
 * Inspired by formal intent specification research (AISpec, SpecKit):
 *   - AST_REFACTOR: The *structure* of intent is unchanged. Code is
 *     reorganized, renamed, or reformatted but the observable behavior
 *     and the associated requirement remain the same.
 *   - INTENT_EVOLUTION: A new capability, feature, or business rule is
 *     being introduced or fundamentally altered. This represents a
 *     change TO the intent graph, not just the code graph.
 *
 * References:
 *   - AISpec: https://github.com/cbora/aispec
 *   - Formal intent specification: http://sunnyday.mit.edu/papers/intent-tse.pdf
 */

export type MutationClass = "AST_REFACTOR" | "INTENT_EVOLUTION"

/**
 * Heuristic signals that indicate an AST_REFACTOR (syntax-only change).
 * If the content change matches these patterns, it's likely a refactor.
 */
const REFACTOR_PATTERNS: RegExp[] = [
	// Rename — only identifiers changed (camelCase/snake_case transformations)
	/^[-+]\s*(const|let|var|function|class|interface|type|export)\s+\w+\s*=/m,
	// Pure whitespace/formatting changes
	/^\s*$/m,
	// Import reorganization
	/^[-+]\s*import\s+/m,
	// Comment-only changes
	/^[-+]\s*(\/\/|\/\*|\*)/m,
]

/**
 * Heuristic signals that indicate INTENT_EVOLUTION (new feature/behavior).
 */
const EVOLUTION_PATTERNS: RegExp[] = [
	// New function/method definitions with logic
	/^\+\s*(async\s+)?function\s+\w+\s*\(/m,
	/^\+\s*(public|private|protected|static)?\s*(async\s+)?\w+\s*\([^)]*\)\s*[:{]/m,
	// New class/interface with substantive body
	/^\+\s*(export\s+)?(class|interface)\s+\w+/m,
	// New exported value (new API surface)
	/^\+\s*export\s+(const|let|function|class|default)/m,
	// New route/handler/endpoint patterns
	/^\+\s*(app|router)\.(get|post|put|delete|patch|use)\s*\(/m,
	// New conditional business logic
	/^\+\s*if\s*\(.+\)\s*\{/m,
]

export interface MutationClassificationInput {
	/** Explicit mutation_class from the tool call, if provided by the LLM. */
	explicitClass?: "AST_REFACTOR" | "INTENT_EVOLUTION" | null
	/** The new file content (for write_to_file) or diff string. */
	content: string
	/** True if this is a brand-new file being created. */
	isNewFile?: boolean
}

/**
 * Classifies a mutation as AST_REFACTOR or INTENT_EVOLUTION.
 *
 * Priority:
 * 1. If the LLM explicitly provided a mutation_class, trust it.
 * 2. If the file is brand-new, it's always INTENT_EVOLUTION.
 * 3. Run heuristic pattern matching on content.
 * 4. Default to INTENT_EVOLUTION (conservative — prefer over-reporting new intent).
 */
export function classifyMutation(input: MutationClassificationInput): MutationClass {
	// 1. Explicit override from the LLM
	if (input.explicitClass === "AST_REFACTOR" || input.explicitClass === "INTENT_EVOLUTION") {
		return input.explicitClass
	}

	// 2. New files are always INTENT_EVOLUTION
	if (input.isNewFile) {
		return "INTENT_EVOLUTION"
	}

	const content = input.content

	// 3. Check for evolution signals first (higher confidence)
	for (const pattern of EVOLUTION_PATTERNS) {
		if (pattern.test(content)) {
			return "INTENT_EVOLUTION"
		}
	}

	// 4. Check for refactor-only signals
	const refactorSignals = REFACTOR_PATTERNS.filter((p) => p.test(content)).length
	if (refactorSignals >= 2) {
		return "AST_REFACTOR"
	}

	// 5. Conservative default
	return "INTENT_EVOLUTION"
}

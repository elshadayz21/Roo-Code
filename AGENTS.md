# AGENTS.md

> **Purpose**: A persistent knowledge base shared across parallel agent sessions (Architect / Builder / Tester).
> Updated incrementally when verification loops fail or architectural decisions are made.

---

## Project-Specific Rules

- **Settings View Pattern**: When working on `SettingsView`, inputs must bind to the local `cachedState`, NOT the live `useExtensionState()`. The `cachedState` acts as a buffer for user edits, isolating them from the `ContextProxy` source-of-truth until the user explicitly clicks "Save". Wiring inputs directly to the live state causes race conditions.

---

## Architectural Decisions

| Date       | Decision                           | Rationale                                                                  | Decided By |
| ---------- | ---------------------------------- | -------------------------------------------------------------------------- | ---------- |
| 2026-02-18 | Adopt `.jsonl` for agent trace log | Append-only format ensures spatial independence and safe concurrent writes | Architect  |

---

## Lessons Learned

<!-- Append new lessons here. Each entry should include a date, context, and takeaway. -->

| Date       | Context                     | Lesson                                                                                         |
| ---------- | --------------------------- | ---------------------------------------------------------------------------------------------- |
| 2026-02-18 | Initial orchestration setup | Always use content hashing for code ranges to maintain validity when lines shift               |
| 2026-02-18 | Intent lifecycle tracking   | Formalize acceptance criteria upfront — they serve as the "Definition of Done" for each intent |

---

## Orchestration File Reference

| File                                 | Format | Purpose                                           | Update Trigger                                    |
| ------------------------------------ | ------ | ------------------------------------------------- | ------------------------------------------------- |
| `.orchestration/active_intents.yaml` | YAML   | Tracks lifecycle of business intents (the _why_)  | Pre-Hook (task start) / Post-Hook (task complete) |
| `.orchestration/agent_trace.jsonl`   | JSONL  | Append-only ledger linking intents to code hashes | Post-Hook after file writes                       |
| `.orchestration/intent_map.md`       | MD     | Maps intents to physical files and AST nodes      | On INTENT_EVOLUTION                               |
| `AGENTS.md`                          | MD     | Shared brain — rules, decisions, lessons learned  | On verification failure or arch decision          |

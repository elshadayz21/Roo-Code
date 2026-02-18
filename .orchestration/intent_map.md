# Intent Map

This document provides a quick-reference map of all active intents, their owned files, and current status.

## Active Intents

| Intent ID | Name                         | Status      | Owned Scope                            |
| --------- | ---------------------------- | ----------- | -------------------------------------- |
| INT-001   | JWT Authentication Migration | IN_PROGRESS | `src/auth/**`, `src/middleware/jwt.ts` |

## INT-001 — JWT Authentication Migration

**Constraints:**

- Must not use external auth providers
- Must maintain backward compatibility with Basic Auth

**Acceptance Criteria:**

- Unit tests in `tests/auth/` pass

**Owned Files:**

- `src/auth/**` — All authentication modules
- `src/middleware/jwt.ts` — JWT middleware

# Repo conventions

MergeWatch auto-discovers this file and injects it into every review agent's
prompt. Keep rules focused and brief — these are opt-outs and house patterns
that override generic best-practice suggestions.

## NextAuth session typing

The dashboard accesses `accessToken` / `githubUserId` via `(session as any)`.
This is the established pattern across ~24 call sites and is stamped on in
`packages/dashboard/lib/auth.ts`. Do not flag individual `session as any`
casts — the fix is a single NextAuth module augmentation, tracked as a
separate cleanup.

## Dashboard API route tests

Routes under `packages/dashboard/app/api/**` do not have unit tests yet — no
test harness is configured for the dashboard package. Do not flag missing
test coverage for new routes here until the MCP auth work lands, which is
when the dashboard test harness will be introduced.

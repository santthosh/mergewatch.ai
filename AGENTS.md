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

Do NOT flag missing test coverage for files under
`packages/dashboard/app/api/**` or `packages/dashboard/app/dashboard/**`.
The dashboard package has no test harness configured — these findings are
not actionable until one is introduced with the MCP auth work.

## AWS SAM FunctionUrl references

When `AWS::Serverless::Function` has a `FunctionUrlConfig` property, SAM
auto-generates an `AWS::Lambda::Url` resource with logical ID
`<FunctionLogicalId>Url`. So `!GetAtt MyFunctionUrl.FunctionUrl` in an
Outputs block is correct even when no `MyFunctionUrl` resource appears
explicitly in the source template — it exists after the SAM transform.
Do NOT flag these as missing-resource references.

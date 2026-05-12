/**
 * Detect whether a GitHub webhook actor is a bot.
 *
 * GitHub surfaces "bot-ness" through two independent signals:
 *
 *  1. `user.type === 'Bot'` — set by GitHub for GitHub Apps acting as
 *     themselves (App-authenticated webhook deliveries).
 *  2. `user.login` ending with `[bot]` — the canonical suffix GitHub
 *     attaches to App bot accounts (e.g. `dependabot[bot]`,
 *     `copilot-pull-request-reviewer[bot]`).
 *
 * Either signal alone is enough to call something a bot. Apps that drive
 * comments via an OAuth user identity (rare) will still surface as
 * `type === 'User'` with a `[bot]` suffix on the login.
 *
 * We use this to silence MergeWatch's reply loops — only humans should
 * trigger inline-reply or @mergewatch flows, never other bots commenting
 * on a PR.
 */
export function isBotActor(actor: { type?: string; login?: string } | null | undefined): boolean {
  if (!actor) return false;
  if (actor.type === 'Bot') return true;
  if (actor.login && actor.login.toLowerCase().endsWith('[bot]')) return true;
  return false;
}

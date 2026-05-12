import { describe, it, expect } from 'vitest';
import { isBotActor } from './bot-actor.js';

describe('isBotActor', () => {
  it('returns true when actor.type is "Bot"', () => {
    expect(isBotActor({ type: 'Bot', login: 'dependabot[bot]' })).toBe(true);
  });

  it('returns true when login ends with [bot] even if type is "User"', () => {
    expect(isBotActor({ type: 'User', login: 'copilot-pull-request-reviewer[bot]' })).toBe(true);
  });

  it('returns true for [bot] suffix regardless of case', () => {
    expect(isBotActor({ type: 'User', login: 'CopilotAI[BOT]' })).toBe(true);
  });

  it('returns true when only login is set with [bot] suffix', () => {
    expect(isBotActor({ login: 'codeql[bot]' })).toBe(true);
  });

  it('returns false for a regular human user', () => {
    expect(isBotActor({ type: 'User', login: 'alice' })).toBe(false);
  });

  it('returns false for an Organization actor', () => {
    expect(isBotActor({ type: 'Organization', login: 'octo-org' })).toBe(false);
  });

  it('returns false for null/undefined actors', () => {
    expect(isBotActor(null)).toBe(false);
    expect(isBotActor(undefined)).toBe(false);
  });

  it('returns false for an empty object', () => {
    expect(isBotActor({})).toBe(false);
  });

  it('does not match logins that merely contain "bot"', () => {
    expect(isBotActor({ type: 'User', login: 'robotnik' })).toBe(false);
    expect(isBotActor({ type: 'User', login: 'bot-fan-99' })).toBe(false);
  });

  // Loop-guard tests: MergeWatch's own bot account must also be classified
  // as a bot so the webhook handler skips events originating from us.
  describe('MergeWatch self-recognition', () => {
    it('treats the SaaS MergeWatch bot account as a bot', () => {
      expect(isBotActor({ type: 'Bot', login: 'mergewatch[bot]' })).toBe(true);
    });

    it('treats a self-hosted MergeWatch instance with a custom App name as a bot', () => {
      // Each self-hosted operator installs their own GitHub App with a name
      // they choose. GitHub still appends [bot] to its login and sets type=Bot.
      expect(isBotActor({ type: 'Bot', login: 'acme-reviewer[bot]' })).toBe(true);
      expect(isBotActor({ type: 'Bot', login: 'internal-mergewatch[bot]' })).toBe(true);
    });
  });
});

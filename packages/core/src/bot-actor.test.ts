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
});

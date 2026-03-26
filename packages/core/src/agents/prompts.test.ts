import { describe, it, expect } from 'vitest';
import {
  SECURITY_REVIEWER_PROMPT,
  BUG_REVIEWER_PROMPT,
  STYLE_REVIEWER_PROMPT,
  SUMMARY_PROMPT,
  DIAGRAM_PROMPT,
  ORCHESTRATOR_PROMPT,
  ERROR_HANDLING_REVIEWER_PROMPT,
  TEST_COVERAGE_REVIEWER_PROMPT,
  COMMENT_ACCURACY_REVIEWER_PROMPT,
  TONE_DIRECTIVES,
  TONE_PLACEHOLDER,
  CUSTOM_AGENT_RESPONSE_FORMAT,
} from './prompts.js';

// ─── Prompt constants are non-empty strings ─────────────────────────────────

describe('prompt constants are non-empty strings', () => {
  const prompts: Record<string, string> = {
    SECURITY_REVIEWER_PROMPT,
    BUG_REVIEWER_PROMPT,
    STYLE_REVIEWER_PROMPT,
    SUMMARY_PROMPT,
    DIAGRAM_PROMPT,
    ORCHESTRATOR_PROMPT,
    ERROR_HANDLING_REVIEWER_PROMPT,
    TEST_COVERAGE_REVIEWER_PROMPT,
    COMMENT_ACCURACY_REVIEWER_PROMPT,
  };

  for (const [name, value] of Object.entries(prompts)) {
    it(`${name} is a non-empty string`, () => {
      expect(typeof value).toBe('string');
      expect(value.trim().length).toBeGreaterThan(0);
    });
  }
});

// ─── Placeholder presence ───────────────────────────────────────────────────

describe('placeholder presence in prompts', () => {
  it('SECURITY_REVIEWER_PROMPT contains FILE_REQUEST_PLACEHOLDER', () => {
    expect(SECURITY_REVIEWER_PROMPT).toContain('FILE_REQUEST_PLACEHOLDER');
  });

  it('BUG_REVIEWER_PROMPT contains FILE_REQUEST_PLACEHOLDER', () => {
    expect(BUG_REVIEWER_PROMPT).toContain('FILE_REQUEST_PLACEHOLDER');
  });

  it('STYLE_REVIEWER_PROMPT contains CUSTOM_RULES_PLACEHOLDER', () => {
    expect(STYLE_REVIEWER_PROMPT).toContain('CUSTOM_RULES_PLACEHOLDER');
  });

  it('ORCHESTRATOR_PROMPT contains MAX_FINDINGS_PLACEHOLDER', () => {
    expect(ORCHESTRATOR_PROMPT).toContain('MAX_FINDINGS_PLACEHOLDER');
  });
});

// ─── Tone directives ────────────────────────────────────────────────────────

describe('TONE_DIRECTIVES', () => {
  it('has entries for collaborative, direct, and advisory', () => {
    expect(TONE_DIRECTIVES).toHaveProperty('collaborative');
    expect(TONE_DIRECTIVES).toHaveProperty('direct');
    expect(TONE_DIRECTIVES).toHaveProperty('advisory');
    expect(typeof TONE_DIRECTIVES.collaborative).toBe('string');
    expect(typeof TONE_DIRECTIVES.direct).toBe('string');
    expect(typeof TONE_DIRECTIVES.advisory).toBe('string');
  });
});

// ─── Agent prompts contain TONE_PLACEHOLDER ─────────────────────────────────

describe('agent prompts contain TONE_PLACEHOLDER', () => {
  const agentPrompts: Record<string, string> = {
    SECURITY_REVIEWER_PROMPT,
    BUG_REVIEWER_PROMPT,
    STYLE_REVIEWER_PROMPT,
    ERROR_HANDLING_REVIEWER_PROMPT,
    TEST_COVERAGE_REVIEWER_PROMPT,
    COMMENT_ACCURACY_REVIEWER_PROMPT,
  };

  for (const [name, value] of Object.entries(agentPrompts)) {
    it(`${name} contains TONE_PLACEHOLDER`, () => {
      expect(value).toContain(TONE_PLACEHOLDER);
    });
  }
});

// ─── CUSTOM_AGENT_RESPONSE_FORMAT ───────────────────────────────────────────

describe('CUSTOM_AGENT_RESPONSE_FORMAT', () => {
  it('contains "findings" in its schema', () => {
    expect(CUSTOM_AGENT_RESPONSE_FORMAT).toContain('findings');
  });
});

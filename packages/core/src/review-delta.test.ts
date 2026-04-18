import { describe, it, expect } from 'vitest';
import { computeReviewDelta } from './review-delta.js';

function finding(file: string, title: string, line = 1) {
  return { file, title, line };
}

describe('computeReviewDelta', () => {
  it('returns null when previous findings is null', () => {
    const result = computeReviewDelta([finding('a.ts', 'Bug')], null);
    expect(result).toBeNull();
  });

  it('returns null when previous findings is undefined', () => {
    const result = computeReviewDelta([finding('a.ts', 'Bug')], undefined);
    expect(result).toBeNull();
  });

  it('returns null when previous findings is an empty array', () => {
    const result = computeReviewDelta([finding('a.ts', 'Bug')], []);
    expect(result).toBeNull();
  });

  it('marks all findings as carried over when identical', () => {
    const findings = [finding('a.ts', 'Bug'), finding('b.ts', 'Typo')];
    const result = computeReviewDelta(findings, findings);
    expect(result).toMatchObject({ resolvedCount: 0, newCount: 0, carriedOverCount: 2 });
    expect(result!.resolved).toEqual([]);
    expect(result!.new).toEqual([]);
    expect(result!.carriedOver).toHaveLength(2);
  });

  it('marks all as resolved when current is empty and previous has findings', () => {
    const prev = [finding('a.ts', 'Bug'), finding('b.ts', 'Typo')];
    const result = computeReviewDelta([], prev);
    expect(result).toMatchObject({ resolvedCount: 2, newCount: 0, carriedOverCount: 0 });
    expect(result!.resolved).toHaveLength(2);
    expect(result!.resolved[0].title).toBe('Bug');
  });

  it('marks all as new when previous has different findings', () => {
    const prev = [finding('a.ts', 'Old bug')];
    const curr = [finding('x.ts', 'New bug')];
    const result = computeReviewDelta(curr, prev);
    expect(result).toMatchObject({ resolvedCount: 1, newCount: 1, carriedOverCount: 0 });
    expect(result!.resolved[0].title).toBe('Old bug');
    expect(result!.new[0].title).toBe('New bug');
  });

  it('computes a mix of carried, resolved, and new findings', () => {
    const prev = [finding('a.ts', 'Bug'), finding('b.ts', 'Typo'), finding('c.ts', 'Leak')];
    const curr = [finding('a.ts', 'Bug'), finding('d.ts', 'New issue')];
    const result = computeReviewDelta(curr, prev);
    expect(result).toMatchObject({ resolvedCount: 2, newCount: 1, carriedOverCount: 1 });
    expect(result!.carriedOver[0].title).toBe('Bug');
    expect(result!.resolved.map((f) => f.title).sort()).toEqual(['Leak', 'Typo']);
    expect(result!.new[0].title).toBe('New issue');
  });

  it('treats same file+title with different line numbers as carried over', () => {
    const prev = [finding('a.ts', 'Bug', 10)];
    const curr = [finding('a.ts', 'Bug', 25)];
    const result = computeReviewDelta(curr, prev);
    expect(result).toMatchObject({ resolvedCount: 0, newCount: 0, carriedOverCount: 1 });
    expect(result!.carriedOver[0].line).toBe(25); // takes the current line number
  });

  it('handles one resolved and one new finding correctly', () => {
    const prev = [finding('a.ts', 'Old bug')];
    const curr = [finding('a.ts', 'New bug')];
    const result = computeReviewDelta(curr, prev);
    expect(result).toMatchObject({ resolvedCount: 1, newCount: 1, carriedOverCount: 0 });
    expect(result!.resolved[0].title).toBe('Old bug');
    expect(result!.new[0].title).toBe('New bug');
  });
});

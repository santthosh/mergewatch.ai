import { describe, it, expect } from 'vitest';
import { calculateReviewCost } from './cost';
import { INFRA_FEE, MARGIN_PERCENT } from './constants';

describe('calculateReviewCost', () => {
  it('calculates cost for a typical review ($0.02 LLM cost)', () => {
    const result = calculateReviewCost(0.02);
    // total = 0.02 + 0.005 + (0.02 * 0.40) = 0.02 + 0.005 + 0.008 = 0.033
    expect(result.llmCost).toBe(0.02);
    expect(result.platformFee).toBeCloseTo(INFRA_FEE + 0.02 * MARGIN_PERCENT);
    expect(result.total).toBeCloseTo(0.033);
    expect(result.totalCents).toBe(4); // Math.ceil(3.3) = 4
  });

  it('handles zero LLM cost (still charges infra fee)', () => {
    const result = calculateReviewCost(0);
    expect(result.llmCost).toBe(0);
    expect(result.platformFee).toBe(INFRA_FEE);
    expect(result.total).toBe(INFRA_FEE);
    expect(result.totalCents).toBe(1); // Math.ceil(0.5) = 1
  });

  it('clamps negative LLM cost to zero', () => {
    const result = calculateReviewCost(-0.05);
    expect(result.llmCost).toBe(0);
    expect(result.total).toBe(INFRA_FEE);
  });

  it('rounds totalCents up (never undercharges)', () => {
    // 0.01 LLM → total = 0.01 + 0.005 + 0.004 = 0.019 → 1.9 cents → 2
    const result = calculateReviewCost(0.01);
    expect(result.totalCents).toBe(2);
  });

  it('handles large LLM cost', () => {
    const result = calculateReviewCost(1.0);
    // total = 1.0 + 0.005 + 0.40 = 1.405
    expect(result.total).toBeCloseTo(1.405);
    expect(result.totalCents).toBe(141); // Math.ceil(140.5) = 141
  });

  it('returns all four fields', () => {
    const result = calculateReviewCost(0.05);
    expect(result).toHaveProperty('llmCost');
    expect(result).toHaveProperty('platformFee');
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('totalCents');
    expect(typeof result.totalCents).toBe('number');
    expect(Number.isInteger(result.totalCents)).toBe(true);
  });
});

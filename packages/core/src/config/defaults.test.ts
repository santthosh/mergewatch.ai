import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG, mergeConfig } from './defaults.js';

describe('DEFAULT_CONFIG', () => {
  it('has all agent flags as booleans', () => {
    for (const [key, value] of Object.entries(DEFAULT_CONFIG.agents)) {
      expect(typeof value, `agents.${key}`).toBe('boolean');
    }
  });

  it('model is a non-empty string', () => {
    expect(DEFAULT_CONFIG.model).toBeTypeOf('string');
    expect(DEFAULT_CONFIG.model.length).toBeGreaterThan(0);
  });
});

describe('mergeConfig', () => {
  it('empty partial returns object equal to DEFAULT_CONFIG values', () => {
    const result = mergeConfig({});
    expect(result).toEqual(DEFAULT_CONFIG);
  });

  it('overrides model while keeping other defaults', () => {
    const result = mergeConfig({ model: 'custom-model' });
    expect(result.model).toBe('custom-model');
    expect(result.agents).toEqual(DEFAULT_CONFIG.agents);
    expect(result.maxFindings).toBe(DEFAULT_CONFIG.maxFindings);
  });

  it('deep merges agents: security false, others unchanged', () => {
    const result = mergeConfig({ agents: { security: false } });
    expect(result.agents.security).toBe(false);
    expect(result.agents.bugs).toBe(DEFAULT_CONFIG.agents.bugs);
    expect(result.agents.style).toBe(DEFAULT_CONFIG.agents.style);
    expect(result.agents.summary).toBe(DEFAULT_CONFIG.agents.summary);
    expect(result.agents.diagram).toBe(DEFAULT_CONFIG.agents.diagram);
  });

  it('deep merges ux', () => {
    const result = mergeConfig({ ux: { tone: 'direct' } });
    expect(result.ux.tone).toBe('direct');
    expect(result.ux.showWorkDone).toBe(DEFAULT_CONFIG.ux.showWorkDone);
    expect(result.ux.reviewerChecklist).toBe(DEFAULT_CONFIG.ux.reviewerChecklist);
  });

  it('customAgents replaces array (not merge)', () => {
    const custom = [
      { name: 'my-agent', prompt: 'do stuff', severityDefault: 'info' as const, enabled: true },
    ];
    const result = mergeConfig({ customAgents: custom });
    expect(result.customAgents).toEqual(custom);
    expect(result.customAgents).not.toBe(DEFAULT_CONFIG.customAgents);
  });

  it('overrides maxFindings scalar', () => {
    const result = mergeConfig({ maxFindings: 10 });
    expect(result.maxFindings).toBe(10);
  });

  it('returned object is new reference (not DEFAULT_CONFIG)', () => {
    const result = mergeConfig({});
    expect(result).not.toBe(DEFAULT_CONFIG);
  });

  it('mergeConfig with pricing sets pricing field', () => {
    const pricing = { 'my-model': { inputPer1M: 1, outputPer1M: 2 } };
    const result = mergeConfig({ pricing });
    expect(result.pricing).toEqual(pricing);
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { getDeploymentMode, isSaas, isSelfHosted } from './deployment';

describe('deployment mode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('getDeploymentMode', () => {
    it('returns "self-hosted" when DEPLOYMENT_MODE is not set', () => {
      vi.stubEnv('DEPLOYMENT_MODE', '');
      expect(getDeploymentMode()).toBe('self-hosted');
    });

    it('returns "saas" when DEPLOYMENT_MODE=saas', () => {
      vi.stubEnv('DEPLOYMENT_MODE', 'saas');
      expect(getDeploymentMode()).toBe('saas');
    });

    it('is case-insensitive', () => {
      vi.stubEnv('DEPLOYMENT_MODE', 'SaaS');
      expect(getDeploymentMode()).toBe('saas');
    });

    it('returns "self-hosted" for unknown values', () => {
      vi.stubEnv('DEPLOYMENT_MODE', 'cloud');
      expect(getDeploymentMode()).toBe('self-hosted');
    });
  });

  describe('isSaas', () => {
    it('returns true when DEPLOYMENT_MODE=saas', () => {
      vi.stubEnv('DEPLOYMENT_MODE', 'saas');
      expect(isSaas()).toBe(true);
    });

    it('returns false when DEPLOYMENT_MODE is not set', () => {
      vi.stubEnv('DEPLOYMENT_MODE', '');
      expect(isSaas()).toBe(false);
    });
  });

  describe('isSelfHosted', () => {
    it('returns true when DEPLOYMENT_MODE is not set', () => {
      vi.stubEnv('DEPLOYMENT_MODE', '');
      expect(isSelfHosted()).toBe(true);
    });

    it('returns false when DEPLOYMENT_MODE=saas', () => {
      vi.stubEnv('DEPLOYMENT_MODE', 'saas');
      expect(isSelfHosted()).toBe(false);
    });
  });
});

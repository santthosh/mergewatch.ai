import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: class {
    send = mockSend;
  },
  GetParameterCommand: class {
    constructor(public input: any) {}
  },
}));

vi.mock('@octokit/rest', () => ({
  Octokit: class MockOctokit {
    _auth: any;
    constructor(opts: any) { this._auth = opts?.auth; }
  },
}));

vi.mock('@octokit/auth-app', () => ({
  createAppAuth: vi.fn(),
}));

describe('SSMGitHubAuthProvider', () => {
  beforeEach(async () => {
    vi.resetModules();
    mockSend.mockReset();
  });

  async function loadProvider() {
    const { SSMGitHubAuthProvider } = await import('./github-auth-ssm');
    return new SSMGitHubAuthProvider('/test/app-id', '/test/private-key');
  }

  it('fetches appId and privateKey from SSM and returns an Octokit instance', async () => {
    mockSend
      .mockResolvedValueOnce({ Parameter: { Value: '12345' } })    // appId
      .mockResolvedValueOnce({ Parameter: { Value: 'pem-key' } }); // privateKey

    const provider = await loadProvider();
    const octokit = await provider.getInstallationOctokit(999);

    expect(octokit).toBeDefined();
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('caches SSM parameters on subsequent calls', async () => {
    mockSend
      .mockResolvedValueOnce({ Parameter: { Value: '12345' } })
      .mockResolvedValueOnce({ Parameter: { Value: 'pem-key' } });

    const provider = await loadProvider();
    await provider.getInstallationOctokit(1);
    await provider.getInstallationOctokit(2);

    // SSM only called twice (once per parameter), not four times
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('throws when SSM parameter is empty', async () => {
    mockSend.mockResolvedValue({ Parameter: { Value: undefined } });

    const provider = await loadProvider();
    await expect(provider.getInstallationOctokit(1)).rejects.toThrow('not found or empty');
  });

  it('throws when SSM call fails', async () => {
    mockSend.mockRejectedValue(new Error('AccessDeniedException'));

    const provider = await loadProvider();
    await expect(provider.getInstallationOctokit(1)).rejects.toThrow('AccessDeniedException');
  });
});

describe('getWebhookSecret', () => {
  beforeEach(async () => {
    vi.resetModules();
    mockSend.mockReset();
  });

  it('fetches and caches the webhook secret', async () => {
    mockSend.mockResolvedValue({ Parameter: { Value: 'webhook-secret-123' } });

    const { getWebhookSecret } = await import('./github-auth-ssm');
    const first = await getWebhookSecret('/test/webhook-secret');
    const second = await getWebhookSecret('/test/webhook-secret');

    expect(first).toBe('webhook-secret-123');
    expect(second).toBe('webhook-secret-123');
    // Only one SSM call due to caching
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});

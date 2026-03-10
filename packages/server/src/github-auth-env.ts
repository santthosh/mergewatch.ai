import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import type { IGitHubAuthProvider } from '@mergewatch/core';

export class EnvGitHubAuthProvider implements IGitHubAuthProvider {
  private appId: string;
  private privateKey: string;

  constructor(appId: string, privateKey: string) {
    this.appId = appId;
    this.privateKey = privateKey;
  }

  async getInstallationOctokit(installationId: number): Promise<Octokit> {
    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: this.appId,
        privateKey: this.privateKey,
        installationId,
      },
    });
  }
}

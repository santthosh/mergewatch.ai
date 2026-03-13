/**
 * Fetches file contents from GitHub for related files referenced in a PR diff.
 * Respects a token budget (maxContextKB) and skips binary files.
 */

import { Octokit } from '@octokit/rest';

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot',
  '.zip', '.tar', '.gz', '.bz2', '.7z',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.exe', '.dll', '.so', '.dylib',
  '.mp3', '.mp4', '.avi', '.mov', '.webm',
]);

function isBinary(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Fetch file contents from a GitHub repository.
 * Returns a map of filePath -> fileContents, respecting the token budget.
 */
export async function fetchFileContents(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
  filePaths: string[],
  maxContextKB: number = 256,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  let totalBytes = 0;
  const maxBytes = maxContextKB * 1024;

  for (const filePath of filePaths) {
    if (isBinary(filePath)) continue;
    if (totalBytes >= maxBytes) break;

    try {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path: filePath,
        ref,
      });

      if (Array.isArray(data) || data.type !== 'file' || !data.content) {
        continue;
      }

      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      const contentBytes = Buffer.byteLength(content, 'utf-8');

      if (totalBytes + contentBytes > maxBytes) {
        // Truncate to fit budget
        const remaining = maxBytes - totalBytes;
        result[filePath] = content.slice(0, remaining) + '\n... (truncated)';
        totalBytes = maxBytes;
        break;
      }

      result[filePath] = content;
      totalBytes += contentBytes;
    } catch {
      // File not found or inaccessible — skip silently
    }
  }

  return result;
}

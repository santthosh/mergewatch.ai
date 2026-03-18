/**
 * Regex-based import parser for multiple languages.
 * Resolves relative imports to file paths for fetching related context.
 */

import * as path from 'path';

const TS_JS_PATTERNS = [
  /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /export\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
];

const PYTHON_PATTERNS = [
  /from\s+([\w.]+)\s+import/g,
  /import\s+([\w.]+)/g,
];

const GO_PATTERNS = [
  /import\s+"([^"]+)"/g,
  /import\s+\w+\s+"([^"]+)"/g,
];

const JAVA_PATTERNS = [
  /import\s+(?:static\s+)?([\w.]+)/g,
];

function isRelativePath(importPath: string): boolean {
  return importPath.startsWith('./') || importPath.startsWith('../');
}

function getLanguage(filePath: string): 'ts' | 'python' | 'go' | 'java' | 'unknown' {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) return 'ts';
  if (['.py', '.pyi'].includes(ext)) return 'python';
  if (ext === '.go') return 'go';
  if (['.java', '.kt', '.scala'].includes(ext)) return 'java';
  return 'unknown';
}

const TS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

function resolveRelativeImport(fromFile: string, importPath: string, lang: string): string[] {
  const dir = path.dirname(fromFile);

  if (lang === 'ts') {
    // Strip extension if present, then try common extensions
    const base = importPath.replace(/\.[^/.]+$/, '');
    const resolved = path.join(dir, base);
    const candidates: string[] = [];
    for (const ext of TS_EXTENSIONS) {
      candidates.push(resolved + ext);
    }
    // Also try index file in directory
    for (const ext of TS_EXTENSIONS) {
      candidates.push(path.join(resolved, 'index' + ext));
    }
    return candidates;
  }

  if (lang === 'python') {
    const resolved = path.join(dir, importPath.replace(/\./g, '/'));
    return [resolved + '.py', path.join(resolved, '__init__.py')];
  }

  return [path.join(dir, importPath)];
}

/**
 * Parse imports from file contents and resolve relative paths.
 * Returns a deduplicated list of candidate file paths to fetch.
 */
export function resolveImports(
  filePath: string,
  fileContent: string,
): string[] {
  const lang = getLanguage(filePath);
  if (lang === 'unknown') return [];

  let patterns: RegExp[];
  switch (lang) {
    case 'ts': patterns = TS_JS_PATTERNS; break;
    case 'python': patterns = PYTHON_PATTERNS; break;
    case 'go': patterns = GO_PATTERNS; break;
    case 'java': patterns = JAVA_PATTERNS; break;
  }

  const candidates = new Set<string>();

  for (const pattern of patterns) {
    // Reset lastIndex for global regex reuse
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(fileContent)) !== null) {
      const importPath = match[1];
      if (!importPath) continue;

      if (isRelativePath(importPath)) {
        const resolved = resolveRelativeImport(filePath, importPath, lang);
        for (const r of resolved) {
          // Normalize path (remove leading ./)
          const normalized = r.replace(/^\.\//, '');
          candidates.add(normalized);
        }
      }
    }
  }

  return Array.from(candidates);
}

/**
 * Given a set of changed files and their contents, resolve imports up to maxDepth levels.
 * Returns all unique file paths that should be fetched as related context.
 */
export function resolveImportsForFiles(
  fileContents: Record<string, string>,
  maxDepth: number = 1,
): string[] {
  const allCandidates = new Set<string>();
  const processed = new Set<string>(Object.keys(fileContents));

  let currentFiles = { ...fileContents };

  for (let depth = 0; depth < maxDepth; depth++) {
    for (const [filePath, content] of Object.entries(currentFiles)) {
      const imports = resolveImports(filePath, content);
      for (const imp of imports) {
        if (!processed.has(imp) && !allCandidates.has(imp)) {
          allCandidates.add(imp);
        }
      }
    }

    // For depth > 0, we'd need to fetch these files and resolve their imports too
    // but we don't have the content yet — the caller handles that
    if (depth === 0) break;
  }

  return Array.from(allCandidates);
}

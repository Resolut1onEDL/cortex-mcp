import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';

interface GitInfo {
  branch: string;
  remote: string;
  last_commit: string;
  status: string;
}

interface PackageInfo {
  name: string;
  version: string;
  dependencies: string[];
  scripts: string[];
}

interface ProjectAnalysis {
  directory: string;
  git: GitInfo | null;
  package: PackageInfo | null;
  file_count: number;
  languages: Record<string, number>;
  tree: string[];
}

function tryExec(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, timeout: 5000, encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

function getGitInfo(dir: string): GitInfo | null {
  const branch = tryExec('git rev-parse --abbrev-ref HEAD', dir);
  if (!branch) return null;

  return {
    branch,
    remote: tryExec('git remote get-url origin', dir),
    last_commit: tryExec('git log -1 --oneline', dir),
    status: tryExec('git status --short', dir),
  };
}

function getPackageInfo(dir: string): PackageInfo | null {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return null;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return {
      name: pkg.name || 'unknown',
      version: pkg.version || '0.0.0',
      dependencies: Object.keys(pkg.dependencies || {}),
      scripts: Object.keys(pkg.scripts || {}),
    };
  } catch {
    return null;
  }
}

const EXT_LANGUAGE: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript',
  '.js': 'JavaScript', '.jsx': 'JavaScript',
  '.py': 'Python',
  '.go': 'Go',
  '.rs': 'Rust',
  '.java': 'Java',
  '.rb': 'Ruby',
  '.css': 'CSS', '.scss': 'CSS',
  '.html': 'HTML',
  '.json': 'JSON',
  '.md': 'Markdown',
  '.yaml': 'YAML', '.yml': 'YAML',
};

function scanDirectory(dir: string, maxDepth: number = 3, currentDepth: number = 0): { files: number; languages: Record<string, number>; tree: string[] } {
  const result = { files: 0, languages: {} as Record<string, number>, tree: [] as string[] };
  const IGNORE = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv', 'venv']);

  if (currentDepth > maxDepth) return result;

  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (IGNORE.has(entry)) continue;
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      const indent = '  '.repeat(currentDepth);

      if (stat.isDirectory()) {
        result.tree.push(`${indent}${entry}/`);
        const sub = scanDirectory(fullPath, maxDepth, currentDepth + 1);
        result.files += sub.files;
        result.tree.push(...sub.tree);
        for (const [lang, count] of Object.entries(sub.languages)) {
          result.languages[lang] = (result.languages[lang] || 0) + count;
        }
      } else {
        result.files++;
        if (currentDepth <= 2) {
          result.tree.push(`${indent}${entry}`);
        }
        const ext = '.' + basename(entry).split('.').pop();
        const lang = EXT_LANGUAGE[ext];
        if (lang) {
          result.languages[lang] = (result.languages[lang] || 0) + 1;
        }
      }
    }
  } catch {
    // Permission denied or other error
  }

  return result;
}

export function analyzeProject(directory: string): ProjectAnalysis {
  const scan = scanDirectory(directory);

  return {
    directory,
    git: getGitInfo(directory),
    package: getPackageInfo(directory),
    file_count: scan.files,
    languages: scan.languages,
    tree: scan.tree.slice(0, 100), // Limit tree output
  };
}

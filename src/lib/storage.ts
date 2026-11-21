// Pure Node module (no vscode import) so it can be unit-tested.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Project } from './types';

export interface LoadResult {
  projects: Project[];
  error: Error | null;
}

/** Expand a leading "~" and ${env:NAME} placeholders. Non-strings become "". */
export function expandPath(p: unknown): string {
  if (typeof p !== 'string') return '';
  let out = p.replace(/\$\{env:([^}]+)\}/g, (_, name: string) => process.env[name] || '');
  if (out === '~' || out.startsWith('~/') || out.startsWith('~\\')) {
    out = path.join(os.homedir(), out.slice(1));
  }
  return out;
}

/** Stable key for comparing paths (case-insensitive on Windows). */
export function normalizePath(p: string): string {
  const r = path.resolve(p);
  return process.platform === 'win32' ? r.toLowerCase() : r;
}

/** Coerce arbitrary JSON into a clean project list; drops invalid entries. */
export function sanitize(data: unknown): Project[] {
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const out: Project[] = [];
  for (const raw of data) {
    const item = raw as Record<string, unknown> | null | undefined;
    if (!item || typeof item.rootPath !== 'string' || !item.rootPath.trim()) continue;
    const rootPath = expandPath(item.rootPath.trim());
    const key = normalizePath(rootPath);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : path.basename(rootPath),
      rootPath,
      tags: Array.isArray(item.tags)
        ? [
            ...new Set(
              item.tags
                .filter((t): t is string => typeof t === 'string' && t.trim() !== '')
                .map((t) => t.trim())
            ),
          ]
        : [],
      enabled: item.enabled !== false,
      lastOpened: typeof item.lastOpened === 'number' && Number.isFinite(item.lastOpened) ? item.lastOpened : 0,
    });
  }
  return out;
}

/** Read the projects file. Missing file is not an error. */
export function load(file: string): LoadResult {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { projects: [], error: null };
    return { projects: [], error: e as Error };
  }
  if (!raw.trim()) return { projects: [], error: null };
  try {
    return { projects: sanitize(JSON.parse(raw)), error: null };
  } catch (e) {
    return { projects: [], error: e as Error };
  }
}

/** Atomic write: temp file + rename, so a crash never leaves a half-written file. */
export function save(file: string, projects: Project[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(projects, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

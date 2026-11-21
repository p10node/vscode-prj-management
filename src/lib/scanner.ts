// Pure Node module (no vscode import). Finds folders containing a marker (e.g. ".git").
import * as fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import * as path from 'node:path';
import type { ProjectRef } from './types';

export interface ScanOptions {
  marker?: string;
  ignored?: string[];
  maxDepth?: number;
}

/** Compile a simple "*" wildcard pattern into a RegExp (case-sensitive, whole name). */
export function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/**
 * Scan base folders for directories that contain `marker`.
 * A found project is not descended into. Symlinked directories are not followed.
 */
export async function scan(baseFolders: string[], opts: ScanOptions = {}): Promise<ProjectRef[]> {
  const marker = opts.marker || '.git';
  const maxDepth = opts.maxDepth !== undefined && Number.isInteger(opts.maxDepth) ? opts.maxDepth : 4;
  const ignored = (opts.ignored || []).map(wildcardToRegExp);
  const isIgnored = (name: string) => ignored.some((re) => re.test(name));
  const found = new Map<string, ProjectRef>();

  async function walk(dir: string, depth: number): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable (permissions, vanished) -> skip silently
    }
    if (entries.some((e) => e.name === marker)) {
      found.set(dir, { name: path.basename(dir), rootPath: dir });
      return;
    }
    if (depth >= maxDepth) return;
    const subdirs = entries.filter((e) => e.isDirectory() && !isIgnored(e.name));
    await Promise.all(subdirs.map((e) => walk(path.join(dir, e.name), depth + 1)));
  }

  await Promise.all(baseFolders.map((b) => walk(path.resolve(b), 0)));
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Pure module (no vscode import) so it can be unit-tested.
import type { Project } from './types';

export type SortMode = 'Name' | 'NameDesc' | 'Path' | 'Saved' | 'SavedDesc' | 'Recent';

/** Every mode, in the order shown to the user. Keep in sync with `p10.sortList` in package.json. */
export const SORT_MODES: readonly { mode: SortMode; label: string; description: string }[] = [
  { mode: 'Name', label: 'Name (A → Z)', description: 'Alphabetical by name' },
  { mode: 'NameDesc', label: 'Name (Z → A)', description: 'Reverse alphabetical by name' },
  { mode: 'Path', label: 'Path (A → Z)', description: 'Alphabetical by folder path' },
  { mode: 'Saved', label: 'Saved order (oldest first)', description: 'Order in projects.json' },
  { mode: 'SavedDesc', label: 'Saved order (newest first)', description: 'Last saved on top' },
  { mode: 'Recent', label: 'Recently opened', description: 'Most recently opened first' },
];

/** Unknown or missing values fall back to "Name". */
export function toSortMode(v: unknown): SortMode {
  return SORT_MODES.some((m) => m.mode === v) ? (v as SortMode) : 'Name';
}

export const sortLabel = (mode: SortMode) => SORT_MODES.find((m) => m.mode === mode)?.label ?? mode;

const byName = (a: Project, b: Project) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
const byPath = (a: Project, b: Project) => a.rootPath.localeCompare(b.rootPath, undefined, { sensitivity: 'base' });

/** Return a new sorted array; the input is not modified. */
export function sortProjects(list: readonly Project[], mode: SortMode): Project[] {
  const out = [...list];
  switch (mode) {
    case 'Name':
      return out.sort((a, b) => byName(a, b) || byPath(a, b));
    case 'NameDesc':
      return out.sort((a, b) => byName(b, a) || byPath(a, b));
    case 'Path':
      return out.sort((a, b) => byPath(a, b) || byName(a, b));
    case 'Saved':
      return out; // file order: projects are appended when saved
    case 'SavedDesc':
      return out.reverse();
    case 'Recent':
      return out.sort((a, b) => b.lastOpened - a.lastOpened || byName(a, b) || byPath(a, b));
  }
}

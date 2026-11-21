import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { scan, wildcardToRegExp } from '../lib/scanner';

function makeTree(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p10-scan-'));
  const mk = (...p: string[]) => fs.mkdirSync(path.join(root, ...p), { recursive: true });
  mk('alpha', '.git');
  mk('group', 'beta', '.git');
  mk('group', 'beta', 'nested', '.git'); // inside a project: must not be listed
  mk('node_modules', 'gamma', '.git'); // ignored
  mk('deep', 'a', 'b', 'c', 'd', 'delta', '.git'); // beyond depth
  mk('plain');
  return root;
}

test('wildcardToRegExp matches whole names', () => {
  assert.ok(wildcardToRegExp('node_modules').test('node_modules'));
  assert.ok(!wildcardToRegExp('node_modules').test('my_node_modules'));
  assert.ok(wildcardToRegExp('.*cache').test('.mycache'));
  assert.ok(!wildcardToRegExp('a.c').test('abc'));
});

test('scan finds repos, skips ignored, nested and too-deep ones', async () => {
  const root = makeTree();
  const res = await scan([root], { ignored: ['node_modules'], maxDepth: 3 });
  assert.deepEqual(
    res.map((r) => r.name),
    ['alpha', 'beta']
  );
});

test('scan tolerates missing base folder', async () => {
  assert.deepEqual(await scan(['/definitely/not/here']), []);
});

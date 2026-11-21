import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as storage from '../lib/storage';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'p10-storage-'));

test('expandPath handles ~ and env vars', () => {
  assert.equal(storage.expandPath('~'), os.homedir());
  assert.equal(storage.expandPath('~/code'), path.join(os.homedir(), 'code'));
  process.env.P10_TEST = '/x';
  assert.equal(storage.expandPath('${env:P10_TEST}/y'), '/x/y');
  assert.equal(storage.expandPath(42), '');
});

test('sanitize drops invalid, dedupes, fills defaults', () => {
  const out = storage.sanitize([
    { rootPath: '/a/b', tags: ['x', 'x', ' ', 3] },
    { rootPath: '/a/b', name: 'dup' },
    { name: 'no path' },
    null,
    { rootPath: '/c', name: ' C ', enabled: false },
  ]);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { name: 'b', rootPath: '/a/b', tags: ['x'], enabled: true, lastOpened: 0 });
  assert.equal(out[1].name, 'C');
  assert.equal(out[1].enabled, false);
  assert.deepEqual(storage.sanitize('nope'), []);
});

test('load: missing file is empty, bad JSON is an error', () => {
  const dir = tmp();
  const f = path.join(dir, 'projects.json');
  assert.deepEqual(storage.load(f), { projects: [], error: null });
  fs.writeFileSync(f, '{ not json');
  const r = storage.load(f);
  assert.deepEqual(r.projects, []);
  assert.ok(r.error);
});

test('save then load round-trips and leaves no temp file', () => {
  const dir = tmp();
  const f = path.join(dir, 'sub', 'projects.json');
  const list = storage.sanitize([{ rootPath: '/r', name: 'R', tags: ['t'] }]);
  storage.save(f, list);
  assert.deepEqual(storage.load(f).projects, list);
  assert.deepEqual(fs.readdirSync(path.dirname(f)), ['projects.json']);
});

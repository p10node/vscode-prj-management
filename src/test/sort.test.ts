import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortProjects, toSortMode } from '../lib/sort';
import type { Project } from '../lib/types';

const p = (name: string, rootPath: string, lastOpened = 0): Project => ({ name, rootPath, tags: [], enabled: true, lastOpened });

const list = [p('beta', '/z/beta', 10), p('Alpha', '/y/alpha', 30), p('gamma', '/x/gamma', 0), p('alpha', '/w/alpha2', 30)];
const names = (l: Project[]) => l.map((x) => x.rootPath);

test('Name: case-insensitive, ties broken by path', () => {
  assert.deepEqual(names(sortProjects(list, 'Name')), ['/w/alpha2', '/y/alpha', '/z/beta', '/x/gamma']);
});

test('NameDesc: Z to A, ties still broken by path ascending', () => {
  assert.deepEqual(names(sortProjects(list, 'NameDesc')), ['/x/gamma', '/z/beta', '/w/alpha2', '/y/alpha']);
});

test('SavedDesc: reverse file order (newest saved first)', () => {
  assert.deepEqual(names(sortProjects(list, 'SavedDesc')), names(list).reverse());
});

test('Path: alphabetical by folder', () => {
  assert.deepEqual(names(sortProjects(list, 'Path')), ['/w/alpha2', '/x/gamma', '/y/alpha', '/z/beta']);
});

test('Saved: keeps file order', () => {
  assert.deepEqual(names(sortProjects(list, 'Saved')), names(list));
});

test('Recent: newest first, ties broken by name, never-opened last', () => {
  assert.deepEqual(names(sortProjects(list, 'Recent')), ['/w/alpha2', '/y/alpha', '/z/beta', '/x/gamma']);
});

test('sortProjects does not mutate its input', () => {
  const copy = [...list];
  sortProjects(list, 'Name');
  assert.deepEqual(list, copy);
});

test('toSortMode falls back to Name', () => {
  assert.equal(toSortMode('Recent'), 'Recent');
  assert.equal(toSortMode('recent'), 'Name');
  assert.equal(toSortMode(undefined), 'Name');
});

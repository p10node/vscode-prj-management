import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';

import * as storage from './lib/storage';
import { scan } from './lib/scanner';
import { SORT_MODES, sortLabel, sortProjects, toSortMode } from './lib/sort';
import { SavedProvider, DetectedProvider, ProjectItem } from './lib/tree';
import type { Project, ProjectRef } from './lib/types';

/** What a command receives: a tree item (sidebar), a project (internal call), or nothing (palette). */
type ProjectArg = ProjectItem | ProjectRef | undefined;

interface ProjectPickItem extends vscode.QuickPickItem {
  project: ProjectRef;
}

let projects: Project[] = [];
let detected: ProjectRef[] = [];
let loadError: Error | null = null;
let projectsFile = '';
let viewAsTags = false;
let statusBar: vscode.StatusBarItem | undefined;
let providers: { saved: SavedProvider; detected: DetectedProvider } | undefined;

const cfg = () => vscode.workspace.getConfiguration('p10');
const samePath = (a: string, b: string) => storage.normalizePath(a) === storage.normalizePath(b);
const asProject = (arg: ProjectArg): ProjectRef | undefined => (arg instanceof ProjectItem ? arg.project : arg);
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** Default target for "open": a new window unless the user chose to replace the current one. */
const opensInNewWindow = () => cfg().get<string>('openIn', 'newWindow') !== 'currentWindow';

// ---------------------------------------------------------------- state helpers

function currentCandidates(): string[] {
  const out: string[] = [];
  const wf = vscode.workspace.workspaceFile;
  if (wf && wf.scheme === 'file') out.push(wf.fsPath);
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders[0] && folders[0].uri.scheme === 'file') out.push(folders[0].uri.fsPath);
  return out;
}

const isCurrent = (p: ProjectRef) => currentCandidates().some((c) => samePath(c, p.rootPath));
const findSaved = (rootPath: string) => projects.find((p) => samePath(p.rootPath, rootPath));

const sortMode = () => toSortMode(cfg().get<string>('sortList', 'Name'));
const sortedProjects = (): Project[] => sortProjects(projects.filter((p) => p.enabled), sortMode());

const unsavedDetected = () => detected.filter((d) => !findSaved(d.rootPath));

// ---------------------------------------------------------------- persistence

function resolveProjectsFile(context: vscode.ExtensionContext): string {
  const loc = storage.expandPath((cfg().get<string>('projectsLocation') || '').trim());
  return path.join(loc || context.globalStorageUri.fsPath, 'projects.json');
}

function reload(): void {
  const res = storage.load(projectsFile);
  if (res.error) {
    // Keep last good in-memory list and block writes so we never clobber the user's file.
    if (!loadError || loadError.message !== res.error.message) {
      vscode.window
        .showErrorMessage(`P10: cannot read projects.json: ${res.error.message}`, 'Open File')
        .then((c) => c && vscode.commands.executeCommand('p10.editProjects'));
    }
    loadError = res.error;
  } else {
    loadError = null;
    projects = res.projects;
  }
  refreshViews();
}

/** Write the list to disk. Returns false (and tells the user) if it cannot. */
function persist(): boolean {
  if (loadError) {
    vscode.window.showErrorMessage('P10: projects.json has errors. Fix it first (command: "Edit Projects").');
    return false;
  }
  try {
    storage.save(projectsFile, projects);
    return true;
  } catch (e) {
    vscode.window.showErrorMessage(`P10: cannot save projects: ${errorMessage(e)}`);
    return false;
  }
}

// ---------------------------------------------------------------- UI helpers

function refreshViews(): void {
  if (providers) {
    providers.saved.refresh();
    providers.detected.refresh();
  }
  updateStatusBar();
}

function updateStatusBar(): void {
  if (!statusBar) return;
  const cands = currentCandidates();
  if (!cfg().get<boolean>('showStatusBar', true) || cands.length === 0) {
    statusBar.hide();
    return;
  }
  const saved = cands.map(findSaved).find(Boolean);
  const name = saved ? saved.name : path.basename(cands[0]).replace(/\.code-workspace$/, '');
  statusBar.text = `$(root-folder) ${name}`;
  statusBar.tooltip = saved ? 'Switch project' : 'Not saved yet. Click to switch project, or run "Save Project".';
  statusBar.command = cfg().get<boolean>('openInNewWindowWhenClickingInStatusBar', false)
    ? 'p10.listProjectsNewWindow'
    : 'p10.listProjects';
  statusBar.show();
}

function tagsLabel(p: ProjectRef): string {
  return p.tags && p.tags.length ? `[${p.tags.join(', ')}]` : '';
}

async function pickProject({ tag, placeHolder }: { tag?: string; placeHolder?: string } = {}): Promise<ProjectRef | undefined> {
  const hideCurrent = cfg().get<boolean>('removeCurrentProjectFromList', false);
  const checkPaths = cfg().get<boolean>('checkInvalidPathsBeforeListing', true);
  const keep = (p: ProjectRef) => !(hideCurrent && isCurrent(p)) && !(checkPaths && !fs.existsSync(p.rootPath));

  const saved = sortedProjects().filter((p) => !tag || p.tags.includes(tag));
  const extra = tag ? [] : unsavedDetected();
  const items: ProjectPickItem[] = [
    ...saved
      .filter(keep)
      .map((p) => ({
        label: `$(${isCurrent(p) ? 'root-folder-opened' : 'root-folder'}) ${p.name}`,
        description: tagsLabel(p),
        detail: p.rootPath,
        project: p,
      })),
    ...extra.filter(keep).map((d) => ({ label: `$(repo) ${d.name}`, description: 'git', detail: d.rootPath, project: d })),
  ];

  if (items.length === 0) {
    // Say why the list is empty: nothing saved yet, or everything was filtered out.
    const all: ProjectRef[] = [...saved, ...extra];
    let msg: string;
    if (all.length === 0) {
      msg = tag ? `No projects tagged "${tag}".` : 'No projects yet. Open a folder and run "Save Project".';
    } else {
      const why: string[] = [];
      if (hideCurrent && all.some(isCurrent)) why.push('the current project is hidden');
      if (checkPaths && all.some((p) => !fs.existsSync(p.rootPath))) why.push('some saved folders no longer exist');
      msg = `No other projects${tag ? ` tagged "${tag}"` : ''} to open (${why.join('; ')}).`;
    }
    vscode.window.showInformationMessage(msg);
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: placeHolder || 'Select a project',
    matchOnDescription: true,
    matchOnDetail: cfg().get<boolean>('filterOnFullPath', false),
  });
  return picked?.project;
}

// ---------------------------------------------------------------- actions

async function openProject(arg: ProjectArg, newWindow: boolean): Promise<void> {
  const p = asProject(arg);
  if (!p) return;
  if (!fs.existsSync(p.rootPath)) {
    const c = await vscode.window.showErrorMessage(`Path not found: ${p.rootPath}`, ...(findSaved(p.rootPath) ? ['Remove from list'] : []));
    if (c) await removeProject(p, true);
    return;
  }
  if (isCurrent(p) && !newWindow) return;

  const saved = findSaved(p.rootPath);
  if (saved) {
    saved.lastOpened = Date.now();
    persist();
  }
  const windowIsEmpty = !vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0;
  const forceNewWindow = newWindow && !(windowIsEmpty && cfg().get<boolean>('openInCurrentWindowIfEmpty', true));
  await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(p.rootPath), { forceNewWindow });
}

async function saveProject(): Promise<void> {
  const cands = currentCandidates();
  if (cands.length === 0) {
    vscode.window.showWarningMessage('Open a folder or workspace first, then save it as a project.');
    return;
  }
  const rootPath = cands[0];
  const existing = findSaved(rootPath);
  if (existing) {
    vscode.window.showInformationMessage(`Already saved as "${existing.name}".`);
    return;
  }
  const base = path.basename(rootPath).replace(/\.code-workspace$/, '');
  const name = await vscode.window.showInputBox({
    prompt: 'Project name',
    value: base,
    validateInput: (v) => (v.trim() ? undefined : 'Name cannot be empty'),
  });
  if (name === undefined) return;
  projects.push({ name: name.trim(), rootPath, tags: [], enabled: true, lastOpened: Date.now() });
  if (persist()) {
    refreshViews();
    vscode.window.showInformationMessage(`Project "${name.trim()}" saved.`);
  } else {
    projects.pop();
  }
}

async function removeProject(arg: ProjectArg, skipConfirm: boolean): Promise<void> {
  const p = asProject(arg);
  const saved = p && findSaved(p.rootPath);
  if (!saved) return;
  if (!skipConfirm) {
    const ok = await vscode.window.showWarningMessage(
      `Delete project "${saved.name}" from the list? (The folder is not touched.)`,
      { modal: true },
      'Delete'
    );
    if (ok !== 'Delete') return;
  }
  const before = projects;
  projects = projects.filter((x) => x !== saved);
  if (persist()) refreshViews();
  else projects = before;
}

async function renameProject(arg: ProjectArg): Promise<void> {
  const p = asProject(arg);
  const saved = p && findSaved(p.rootPath);
  if (!saved) return;
  const name = await vscode.window.showInputBox({
    prompt: 'New project name',
    value: saved.name,
    validateInput: (v) => (v.trim() ? undefined : 'Name cannot be empty'),
  });
  if (name === undefined || name.trim() === saved.name) return;
  const old = saved.name;
  saved.name = name.trim();
  if (persist()) refreshViews();
  else saved.name = old;
}

async function editTags(arg: ProjectArg): Promise<void> {
  const p = asProject(arg);
  const saved = p && findSaved(p.rootPath);
  if (!saved) return;
  const input = await vscode.window.showInputBox({
    prompt: 'Tags, separated by commas (empty to clear)',
    value: saved.tags.join(', '),
  });
  if (input === undefined) return;
  const old = saved.tags;
  saved.tags = [...new Set(input.split(',').map((t) => t.trim()).filter(Boolean))];
  if (persist()) refreshViews();
  else saved.tags = old;
}

async function filterByTag(): Promise<void> {
  const tags = [...new Set(projects.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b));
  if (tags.length === 0) {
    vscode.window.showInformationMessage('No tags yet. Right-click a project and choose "Edit Tags".');
    return;
  }
  const tag = await vscode.window.showQuickPick(tags.map((t) => ({ label: `$(tag) ${t}`, tag: t })), { placeHolder: 'Filter by tag' });
  if (!tag) return;
  const p = await pickProject({ tag: tag.tag, placeHolder: `Projects tagged "${tag.tag}"` });
  if (p) await openProject(p, opensInNewWindow());
}

async function chooseSort(): Promise<void> {
  const current = sortMode();
  const picked = await vscode.window.showQuickPick(
    SORT_MODES.map((m) => ({
      label: `$(${m.mode === current ? 'check' : 'blank'}) ${m.label}`,
      description: m.description,
      mode: m.mode,
    })),
    { placeHolder: `Sort saved projects by… (current: ${sortLabel(current)})` }
  );
  if (!picked || picked.mode === current) return;
  // Write where the value is set now; a global write would be shadowed by a workspace value.
  const info = cfg().inspect<string>('sortList');
  const target =
    info?.workspaceFolderValue !== undefined
      ? vscode.ConfigurationTarget.WorkspaceFolder
      : info?.workspaceValue !== undefined
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;
  await cfg().update('sortList', picked.mode, target); // onDidChangeConfiguration refreshes the views
}

async function addToWorkspace(arg: ProjectArg): Promise<void> {
  const p = asProject(arg) || (await pickProject({ placeHolder: 'Add which project to the workspace?' }));
  if (!p) return;
  let isDir = false;
  try {
    isDir = fs.statSync(p.rootPath).isDirectory();
  } catch {
    /* handled below */
  }
  if (!isDir) {
    vscode.window.showErrorMessage(`Not a folder: ${p.rootPath}`);
    return;
  }
  const count = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0;
  const ok = vscode.workspace.updateWorkspaceFolders(count, 0, { uri: vscode.Uri.file(p.rootPath), name: p.name });
  if (!ok) vscode.window.showWarningMessage('Could not add the folder (is it already in the workspace?).');
}

async function saveDetected(arg: ProjectArg): Promise<void> {
  const d = asProject(arg);
  if (!d || findSaved(d.rootPath)) return;
  projects.push({ name: d.name, rootPath: d.rootPath, tags: [], enabled: true, lastOpened: 0 });
  if (persist()) refreshViews();
  else projects.pop();
}

async function refreshDetected(): Promise<void> {
  const bases = (cfg().get<string[]>('git.baseFolders', []) || []).map((b) => storage.expandPath(b)).filter(Boolean);
  if (bases.length === 0) {
    detected = [];
    refreshViews();
    return;
  }
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'P10: scanning repositories…' }, async () => {
    detected = await scan(bases, {
      marker: '.git',
      ignored: cfg().get<string[]>('git.ignoredFolders', []),
      maxDepth: cfg().get<number>('git.maxDepthRecursion', 4),
    });
  });
  refreshViews();
}

// ---------------------------------------------------------------- activation

export function activate(context: vscode.ExtensionContext): void {
  projectsFile = resolveProjectsFile(context);
  try {
    fs.mkdirSync(path.dirname(projectsFile), { recursive: true });
  } catch {
    /* reported on first save */
  }

  viewAsTags = context.globalState.get<boolean>('p10.viewAsTags', false);
  const setViewMode = (v: boolean) => {
    viewAsTags = v;
    context.globalState.update('p10.viewAsTags', v);
    vscode.commands.executeCommand('setContext', 'p10.viewAsTags', v);
    providers?.saved.refresh();
  };
  vscode.commands.executeCommand('setContext', 'p10.viewAsTags', viewAsTags);

  const savedProvider = new SavedProvider(sortedProjects, isCurrent, () => viewAsTags);
  const detectedProvider = new DetectedProvider(unsavedDetected, isCurrent);
  providers = { saved: savedProvider, detected: detectedProvider };

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);

  const reg = (id: string, fn: (...args: any[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  reg('p10.saveProject', saveProject);
  reg('p10.listProjects', async () => {
    const p = await pickProject();
    if (p) await openProject(p, opensInNewWindow());
  });
  reg('p10.listProjectsNewWindow', async () => {
    const p = await pickProject();
    if (p) await openProject(p, true);
  });
  reg('p10.filterByTag', filterByTag);
  reg('p10.sortBy', chooseSort);
  reg('p10.editProjects', async () => {
    if (!fs.existsSync(projectsFile) && !loadError) storage.save(projectsFile, projects);
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(projectsFile)));
  });
  reg('p10.refresh', async () => {
    reload();
    await refreshDetected();
  });
  reg('p10.openSettings', () => vscode.commands.executeCommand('workbench.action.openSettings', 'p10'));
  reg('p10.addToWorkspace', addToWorkspace);
  reg('p10.viewAsTags', () => setViewMode(true));
  reg('p10.viewAsList', () => setViewMode(false));
  reg('p10.open', (arg: ProjectArg) => openProject(arg, opensInNewWindow()));
  reg('p10.openInNewWindow', (arg: ProjectArg) => openProject(arg, true));
  reg('p10.openInCurrentWindow', (arg: ProjectArg) => openProject(arg, false));
  reg('p10.rename', renameProject);
  reg('p10.editTags', editTags);
  reg('p10.delete', (arg: ProjectArg) => removeProject(arg, false));
  reg('p10.reveal', (arg: ProjectArg) => {
    const p = asProject(arg);
    if (p) vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(p.rootPath));
  });
  reg('p10.saveDetected', saveDetected);

  // Pick up external edits (manual edit, sync tools) without a reload.
  let watcher: vscode.FileSystemWatcher | undefined;
  const watchFile = () => {
    watcher?.dispose();
    const pattern = new vscode.RelativePattern(vscode.Uri.file(path.dirname(projectsFile)), path.basename(projectsFile));
    watcher = vscode.workspace.createFileSystemWatcher(pattern);
    watcher.onDidChange(() => reload());
    watcher.onDidCreate(() => reload());
    watcher.onDidDelete(() => reload());
  };

  context.subscriptions.push(
    statusBar,
    vscode.window.registerTreeDataProvider('p10Saved', savedProvider),
    vscode.window.registerTreeDataProvider('p10Detected', detectedProvider),
    vscode.workspace.onDidChangeWorkspaceFolders(() => refreshViews()),
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (!e.affectsConfiguration('p10')) return;
      if (e.affectsConfiguration('p10.projectsLocation')) {
        projectsFile = resolveProjectsFile(context);
        watchFile();
        reload();
      }
      if (e.affectsConfiguration('p10.git')) await refreshDetected();
      refreshViews();
    }),
    { dispose: () => watcher?.dispose() }
  );

  watchFile();
  reload();
  refreshDetected().catch(() => {});
}

export function deactivate(): void {}

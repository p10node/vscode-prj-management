import * as vscode from 'vscode';
import type { Project, ProjectRef } from './types';

export const UNTAGGED = '(untagged)';

export type ProjectKind = 'project' | 'detected';

export class ProjectItem extends vscode.TreeItem {
  readonly project: ProjectRef;
  readonly kind: ProjectKind;

  constructor(project: ProjectRef, kind: ProjectKind, isCurrent: boolean) {
    super(project.name, vscode.TreeItemCollapsibleState.None);
    this.project = project;
    this.kind = kind;
    this.contextValue = kind;
    this.tooltip =
      `${project.name}\n${project.rootPath}` + (project.tags && project.tags.length ? `\nTags: ${project.tags.join(', ')}` : '');
    this.iconPath = new vscode.ThemeIcon(isCurrent ? 'root-folder-opened' : 'root-folder');
    this.command = { command: 'p10.open', title: 'Open Project', arguments: [this] };
  }
}

export class TagItem extends vscode.TreeItem {
  readonly tag: string;

  /** @param epoch bumped by expand/collapse all: a row keeps its own open state for as long as its id lives */
  constructor(tag: string, count: number, expanded: boolean, epoch: number) {
    super(tag, expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
    this.tag = tag;
    // The prefix keeps a tag apart from a project of the same name in list mode (rows without an id are keyed by label).
    this.id = `tag:${epoch}:${tag}`;
    this.description = String(count);
    this.contextValue = 'tag';
    this.iconPath = new vscode.ThemeIcon('tag');
  }
}

type SavedNode = ProjectItem | TagItem;

export class SavedProvider implements vscode.TreeDataProvider<SavedNode> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private tagsExpanded = true;
  private epoch = 0;

  /**
   * @param getProjects sorted projects
   * @param isCurrent whether a project is the one open in this window
   * @param asTags whether to group by tag
   */
  constructor(
    private readonly getProjects: () => Project[],
    private readonly isCurrent: (p: ProjectRef) => boolean,
    private readonly asTags: () => boolean
  ) {}

  refresh(): void {
    this.emitter.fire();
  }

  /** Expand or collapse every tag at once. Tags that show up later start in the same state. */
  setTagsExpanded(expanded: boolean): void {
    this.tagsExpanded = expanded;
    this.epoch++;
    this.refresh();
  }

  getTreeItem(el: SavedNode): vscode.TreeItem {
    return el;
  }

  getChildren(el?: SavedNode): SavedNode[] {
    const projects = this.getProjects();
    const toItem = (p: Project) => new ProjectItem(p, 'project', this.isCurrent(p));
    if (!el) {
      if (!this.asTags()) return projects.map(toItem);
      const groups = new Map<string, number>();
      for (const p of projects) {
        const tags = p.tags.length ? p.tags : [UNTAGGED];
        for (const t of tags) groups.set(t, (groups.get(t) || 0) + 1);
      }
      return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([t, n]) => new TagItem(t, n, this.tagsExpanded, this.epoch));
    }
    if (el instanceof TagItem) {
      return projects
        .filter((p) => (el.tag === UNTAGGED ? p.tags.length === 0 : p.tags.includes(el.tag)))
        .map(toItem);
    }
    return [];
  }
}

export class DetectedProvider implements vscode.TreeDataProvider<ProjectItem> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(
    private readonly getDetected: () => ProjectRef[],
    private readonly isCurrent: (p: ProjectRef) => boolean
  ) {}

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(el: ProjectItem): vscode.TreeItem {
    return el;
  }

  getChildren(el?: ProjectItem): ProjectItem[] {
    if (el) return [];
    return this.getDetected().map((p) => new ProjectItem(p, 'detected', this.isCurrent(p)));
  }
}

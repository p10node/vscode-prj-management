# P10 Project Manager

[![VS Marketplace](https://badgen.net/vs-marketplace/v/p10node.p10-project-manager)](https://marketplace.visualstudio.com/items?itemName=p10node.p10-project-manager)
[![Open VSX](https://img.shields.io/open-vsx/v/p10node/p10-project-manager?label=Open%20VSX)](https://open-vsx.org/extension/p10node/p10-project-manager)
[![Publish](https://img.shields.io/github/actions/workflow/status/p10node/vscode-prj-management/publish.yml?label=publish)](https://github.com/p10node/vscode-prj-management/actions/workflows/publish.yml)
[![License](https://img.shields.io/github/license/p10node/vscode-prj-management)](LICENSE)

Save, tag and switch between projects in VS Code. **Zero runtime dependencies**: written in TypeScript, compiled to plain JavaScript on the Node built-ins that VS Code already ships.

Independent implementation inspired by the idea of "Project Manager" extensions; it shares no code with them.

## Features

- **Save Project**: store the current folder or `.code-workspace` under a name.
- **Quick switch**: `Cmd+Alt+P` (`Shift+Alt+P` on Windows/Linux) lists projects; pick one to open it.
- **Never clobbers the open project**: projects open in a new window by default (`p10.openIn`). To replace the current one, right-click → *Open in Current Window* or use the folder button in the sidebar. On macOS, VS Code's `window.nativeTabs` turns new windows into tabs.
- **Sidebar** (activity bar → Projects): *Saved* (list or grouped by tag) and *Detected (Git)*.
- **Tags**: right-click a project → *Edit Tags*; `Filter Projects by Tag` from the title bar.
- **Sort**: the sort button in the *Saved* title bar (or `Sort Projects By…`) switches between Name (A→Z / Z→A), Path, Saved order (oldest / newest first) and Recently opened. Applies to the sidebar and the quick pick.
- **Auto-detect repos**: set `p10.git.baseFolders` and repositories under them appear in *Detected*.
- **Add to Workspace** as an extra folder.
- **Status bar** shows the current project; click to switch.
- **Plain JSON storage**: `Edit Projects` opens `projects.json`; external edits are picked up live.

## Settings

| Setting | Default | Purpose |
|---|---|---|
| `p10.projectsLocation` | `""` | Folder for `projects.json` (empty = extension global storage). Good for syncing via Dropbox/git. |
| `p10.sortList` | `Name` | `Name` (A→Z), `NameDesc` (Z→A), `Path` (A→Z), `Saved` (oldest saved first), `SavedDesc` (newest saved first), `Recent` (last opened first) |
| `p10.showStatusBar` | `true` | Show current project in status bar |
| `p10.openIn` | `newWindow` | `newWindow` or `currentWindow`: where a picked/clicked project opens |
| `p10.openInNewWindowWhenClickingInStatusBar` | `false` | |
| `p10.openInCurrentWindowIfEmpty` | `true` | Reuse an empty window instead of opening another |
| `p10.removeCurrentProjectFromList` | `false` | Hide the open project from the quick pick |
| `p10.checkInvalidPathsBeforeListing` | `true` | Hide projects whose folder is gone |
| `p10.filterOnFullPath` | `false` | Match the path while typing |
| `p10.git.baseFolders` | `[]` | Folders to scan (`~` and `${env:NAME}` supported) |
| `p10.git.ignoredFolders` | `node_modules, out, …` | Names to skip (`*` wildcard) |
| `p10.git.maxDepthRecursion` | `4` | Scan depth |

## `projects.json`

```json
[
  { "name": "My App", "rootPath": "/Users/me/code/my-app", "tags": ["work"], "enabled": true, "lastOpened": 0 }
]
```

If the file has a syntax error, the extension keeps the last good list and refuses to write until you fix it, so your data is never overwritten.

## Develop

Tooling uses [Bun](https://bun.sh) (version pinned in `.tool-versions`). The extension itself still runs on VS Code's built-in Node; Bun is only used to install, test and bundle.

```sh
# install dev tools (TypeScript + type definitions only)
bun install

# bundle src/ -> out/extension.js (or `bun run watch`)
bun run build

# type-check (bun build strips types without checking them)
bun run typecheck

# run tests directly from the .ts sources
bun test

# try it: open this folder in VS Code and press F5 (builds first)

# package a .vsix (type-checks and builds first; downloads vsce on demand, not a dependency of the project)
bun run package
```

Sources live in `src/`. `src/lib/storage.ts`, `src/lib/scanner.ts` and `src/lib/sort.ts` do not import `vscode`, so they are unit-tested with `node:test` (run by `bun test`).

## Limits

- Local file system only (`virtualWorkspaces: false`). Remote/SSH windows are not handled.
- Only Git repositories are auto-detected (SVN/Mercurial are not).

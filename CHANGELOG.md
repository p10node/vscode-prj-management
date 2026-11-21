# Changelog

## 0.1.1

- Store listing: fuller description and more search keywords; Q&A now points to GitHub issues.

## 0.1.0

- Save the current folder or `.code-workspace` as a project; switch with `Cmd+Alt+P` (`Shift+Alt+P` on Windows/Linux).
- Projects open in a new window by default (`p10.openIn`); *Open in Current Window* replaces the open one.
- Sidebar with *Saved* (as a list or grouped by tag) and *Detected (Git)* views.
- Tags, filter by tag, and sorting by name, path, saved order or last opened.
- Git repositories auto-detected under `p10.git.baseFolders`.
- Status bar item with the current project.
- Plain `projects.json` storage, reloaded on external edits; never overwritten while it has a syntax error.

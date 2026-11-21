/** A saved project, as stored in projects.json. */
export interface Project {
  name: string;
  rootPath: string;
  tags: string[];
  enabled: boolean;
  lastOpened: number;
}

/** Anything that can be opened: a saved project or a detected repository. */
export interface ProjectRef {
  name: string;
  rootPath: string;
  tags?: string[];
}

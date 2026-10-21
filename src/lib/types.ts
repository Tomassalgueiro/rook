/** A single Markdown note. `path` is relative to the vault root, e.g. "projects/rook.md". */
export interface Note {
  path: string;
  content: string;
}

export interface Vault {
  name: string;
  notes: Note[];
}

export type TreeNode =
  | { kind: "folder"; name: string; path: string; children: TreeNode[] }
  | { kind: "note"; name: string; path: string };

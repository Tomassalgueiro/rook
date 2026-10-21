import type { FileEntry, FileKind, NoteContent } from "./vault";

/** A loaded note. `error` is set when it couldn't be read (e.g. not UTF-8); such notes are read-only. */
export interface Note extends NoteContent {
  error?: string;
}

export interface Vault {
  name: string;
  path: string;
  notes: Note[];
  files: FileEntry[];
  folders: string[];
}

export type FolderAction = "note" | "folder" | "rename" | "delete";

export type TreeNode =
  | { kind: "folder"; name: string; path: string; children: TreeNode[] }
  | { kind: "note"; name: string; path: string }
  | { kind: "file"; name: string; path: string; type: FileKind; ext: string };

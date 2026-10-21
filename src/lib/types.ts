import type { NoteContent } from "./vault";

/** A loaded note. `error` is set when it couldn't be read (e.g. not UTF-8); such notes are read-only. */
export interface Note extends NoteContent {
  error?: string;
}

export interface Vault {
  name: string;
  notes: Note[];
}

export type TreeNode =
  | { kind: "folder"; name: string; path: string; children: TreeNode[] }
  | { kind: "note"; name: string; path: string };

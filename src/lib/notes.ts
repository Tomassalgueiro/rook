import type { Note, TreeNode } from "./types";
import type { FileEntry } from "./vault";

/** "projects/rook.md" -> "rook" */
export function noteTitle(path: string): string {
  const file = path.split("/").pop() ?? path;
  return file.replace(/\.md$/i, "");
}

/** Builds a sorted folder/note/file tree from vault-relative paths; `folders` adds empty ones. */
export function buildTree(notes: { path: string }[], folders: string[] = [], files: FileEntry[] = []): TreeNode[] {
  const root: TreeNode[] = [];
  const childrenByFolder = new Map<string, TreeNode[]>([["", root]]);

  const childrenOf = (folder: string): TreeNode[] => {
    let children = childrenByFolder.get(folder);
    if (!children) {
      const cut = folder.lastIndexOf("/");
      children = [];
      childrenOf(cut < 0 ? "" : folder.slice(0, cut)).push({
        kind: "folder",
        name: folder.slice(cut + 1),
        path: folder,
        children,
      });
      childrenByFolder.set(folder, children);
    }
    return children;
  };

  for (const folder of folders) childrenOf(folder);
  for (const { path } of notes) {
    const cut = path.lastIndexOf("/");
    childrenOf(cut < 0 ? "" : path.slice(0, cut)).push({ kind: "note", name: noteTitle(path), path });
  }
  for (const { path, kind } of files) {
    const cut = path.lastIndexOf("/");
    const file = path.slice(cut + 1);
    const dot = file.lastIndexOf(".");
    childrenOf(cut < 0 ? "" : path.slice(0, cut)).push({
      kind: "file",
      name: file.slice(0, dot),
      path,
      type: kind,
      ext: file.slice(dot + 1).toLowerCase(),
    });
  }
  sortTree(root);
  return root;
}

function sortTree(nodes: TreeNode[]) {
  // Folders first, then notes and files mixed by name.
  const rank = (n: TreeNode) => (n.kind === "folder" ? 0 : 1);
  nodes.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  for (const n of nodes) if (n.kind === "folder") sortTree(n.children);
}

/** Notes containing a [[wikilink]] to the given note's title. */
export function backlinks(notes: Note[], target: Note): Note[] {
  const title = noteTitle(target.path).toLowerCase();
  const re = /\[\[([^\]|#]+)/g;
  return notes.filter(
    (n) =>
      n.path !== target.path &&
      [...n.content.matchAll(re)].some((m) => m[1].trim().toLowerCase() === title),
  );
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

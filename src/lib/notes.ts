import type { Note, TreeNode } from "./types";

/** "projects/rook.md" -> "rook" */
export function noteTitle(path: string): string {
  const file = path.split("/").pop() ?? path;
  return file.replace(/\.md$/i, "");
}

/** Builds a sorted folder/note tree from vault-relative paths; `folders` adds empty ones. */
export function buildTree(notes: { path: string }[], folders: string[] = []): TreeNode[] {
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
  sortTree(root);
  return root;
}

function sortTree(nodes: TreeNode[]) {
  nodes.sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1,
  );
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

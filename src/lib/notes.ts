import type { Note, TreeNode } from "./types";

/** "projects/rook.md" -> "rook" */
export function noteTitle(path: string): string {
  const file = path.split("/").pop() ?? path;
  return file.replace(/\.md$/i, "");
}

/** Builds a sorted folder/note tree from flat vault-relative paths. */
export function buildTree(notes: Note[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const { path } of notes) {
    const parts = path.split("/");
    let level = root;
    parts.slice(0, -1).forEach((name, i) => {
      const folderPath = parts.slice(0, i + 1).join("/");
      let folder = level.find(
        (n): n is Extract<TreeNode, { kind: "folder" }> => n.kind === "folder" && n.path === folderPath,
      );
      if (!folder) {
        folder = { kind: "folder", name, path: folderPath, children: [] };
        level.push(folder);
      }
      level = folder.children;
    });
    level.push({ kind: "note", name: noteTitle(path), path });
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

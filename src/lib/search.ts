// Full-text search over the notes loaded in memory (plus file names).
import { noteTitle } from "./notes";
import type { Note } from "./types";
import type { FileEntry, FileKind } from "./vault";

export interface SearchHit {
  path: string;
  kind: "note" | FileKind;
  title: string;
  folder: string;
  /** All words appear in the title (ranked first). */
  titleMatch: boolean;
  /** Occurrences of the words in the note's text. */
  count: number;
  /** The first match in the text, with the surrounding line for display. */
  match?: { from: number; to: number; before: string; text: string; after: string };
}

const folderOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf("/"), 0));

/** A one-line snippet around text[from, from + length). */
function snippet(text: string, from: number, length: number): NonNullable<SearchHit["match"]> {
  const lineStart = text.lastIndexOf("\n", from - 1) + 1;
  const newline = text.indexOf("\n", from);
  const lineEnd = newline < 0 ? text.length : newline;
  const start = Math.max(lineStart, from - 40);
  const end = Math.min(lineEnd, from + length + 80);
  return {
    from,
    to: from + length,
    before: (start > lineStart ? "…" : "") + text.slice(start, from).trimStart(),
    text: text.slice(from, from + length),
    after: text.slice(from + length, end) + (end < lineEnd ? "…" : ""),
  };
}

/**
 * Notes whose path or text contains every word of `query` (case-insensitive), and files whose
 * path does. Ranked: title matches first, then most occurrences, then path.
 */
export function search(notes: Note[], files: FileEntry[], query: string, limit = 100): SearchHit[] {
  const words = [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))];
  if (!words.length) return [];
  const hits: SearchHit[] = [];

  for (const note of notes) {
    const path = note.path.toLowerCase();
    const body = note.content.toLowerCase();
    if (!words.every((w) => path.includes(w) || body.includes(w))) continue;
    let count = 0;
    let first = -1;
    let firstLength = 0;
    for (const w of words) {
      for (let i = body.indexOf(w); i >= 0 && count < 999; i = body.indexOf(w, i + w.length)) {
        count++;
        if (first < 0 || i < first) [first, firstLength] = [i, w.length];
      }
    }
    const title = noteTitle(note.path);
    hits.push({
      path: note.path,
      kind: "note",
      title,
      folder: folderOf(note.path),
      titleMatch: words.every((w) => title.toLowerCase().includes(w)),
      count,
      match: first >= 0 ? snippet(note.content, first, firstLength) : undefined,
    });
  }

  for (const file of files) {
    const path = file.path.toLowerCase();
    if (!words.every((w) => path.includes(w))) continue;
    const name = file.path.slice(file.path.lastIndexOf("/") + 1);
    hits.push({
      path: file.path,
      kind: file.kind,
      title: name,
      folder: folderOf(file.path),
      titleMatch: words.every((w) => name.toLowerCase().includes(w)),
      count: 0,
    });
  }

  hits.sort((a, b) => Number(b.titleMatch) - Number(a.titleMatch) || b.count - a.count || a.path.localeCompare(b.path));
  return hits.slice(0, limit);
}

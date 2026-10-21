// Rewrites links after notes or files move, so they keep pointing at the right place.
import { parseMarkdown } from "./editor/livePreview";
import { resolveRelative, resolveWikilink } from "./notes";

export interface MoveContext {
  /** Old path -> new path for every moved note and file. */
  moved: Map<string, string>;
  /** Vault paths before the move, used to resolve links as they were written. */
  notesBefore: string[];
  filesBefore: string[];
}

const folderOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf("/"), 0));

/** Path from `fromFolder` to `to`, e.g. ("a/b", "a/c/x.md") -> "../c/x.md". */
export function relativePath(fromFolder: string, to: string): string {
  const from = fromFolder ? fromFolder.split("/") : [];
  const parts = to.split("/");
  let common = 0;
  while (common < from.length && common < parts.length - 1 && from[common] === parts[common]) common++;
  return [...Array(from.length - common).fill(".."), ...parts.slice(common)].join("/");
}

/** New text for a [[wikilink]] target, or null to leave it unchanged. */
function rewriteWikilink(target: string, ctx: MoveContext): string | null {
  const cut = target.search(/[|#]/);
  const name = (cut < 0 ? target : target.slice(0, cut)).trim();
  const rest = cut < 0 ? "" : target.slice(cut);
  if (!name) return null;

  const before = [...ctx.notesBefore, ...ctx.filesBefore].map((path) => ({ path }));
  const old = resolveWikilink(before, name)?.path;
  const now = old && ctx.moved.get(old);
  if (!now) return null;

  const isNote = /\.md$/i.test(now);
  const after = before.map(({ path }) => ({ path: ctx.moved.get(path) ?? path }));
  const baseName = (p: string) => p.slice(p.lastIndexOf("/") + 1);
  const short = isNote ? baseName(now).replace(/\.md$/i, "") : baseName(now);
  // Title links stay titles only while exactly one item has that name; otherwise use the path.
  const sameName = after.filter((x) => baseName(x.path).toLowerCase() === baseName(now).toLowerCase());
  const unique = sameName.length === 1 && resolveWikilink(after, short)?.path === now;
  let next = !name.includes("/") && unique ? short : isNote ? now.replace(/\.md$/i, "") : now;
  if (isNote && /\.md$/i.test(name)) next += ".md";
  return next.toLowerCase() === name.toLowerCase() ? null : next + rest;
}

/** New URL for a relative Markdown link, or null to leave it unchanged. */
function rewriteUrl(raw: string, selfOld: string, selfNew: string, ctx: MoveContext): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("#") || raw.startsWith("/")) return null;
  const hash = raw.indexOf("#");
  const pathPart = hash < 0 ? raw : raw.slice(0, hash);
  const fragment = hash < 0 ? "" : raw.slice(hash);
  if (!pathPart) return null;

  const encoded = /%[0-9a-f]{2}/i.test(pathPart);
  let target = pathPart;
  if (encoded) {
    try {
      target = decodeURIComponent(pathPart);
    } catch {
      // Malformed escapes; use as-is.
    }
  }
  const resolved = resolveRelative(folderOf(selfOld), target);
  if (resolved === null) return null;
  const known = new Set([...ctx.notesBefore, ...ctx.filesBefore]);
  const oldPath = known.has(resolved) ? resolved : known.has(`${resolved}.md`) ? `${resolved}.md` : null;
  if (!oldPath) return null;

  const newPath = ctx.moved.get(oldPath) ?? oldPath;
  if (newPath === oldPath && folderOf(selfOld) === folderOf(selfNew)) return null;
  let rel = relativePath(folderOf(selfNew), newPath);
  if (oldPath !== resolved) rel = rel.replace(/\.md$/i, ""); // the link left out ".md"
  if (encoded) rel = rel.split("/").map(encodeURIComponent).join("/");
  const next = rel + fragment;
  return next === raw ? null : next;
}

/**
 * Updates links in one note's text after a move. `selfOld`/`selfNew` are that note's own path
 * before and after (equal if it didn't move). Links inside code are left alone.
 */
export function updateLinksIn(text: string, selfOld: string, selfNew: string, ctx: MoveContext): string {
  const code: [number, number][] = [];
  const urls: [number, number][] = [];
  parseMarkdown(text).iterate({
    enter: (n) => {
      if (n.name === "InlineCode" || n.name === "FencedCode" || n.name === "CodeBlock") {
        code.push([n.from, n.to]);
        return false;
      }
      if (n.name === "Link" || n.name === "Image") {
        const url = n.node.getChild("URL");
        if (url) urls.push([url.from, url.to]);
      }
    },
  });
  const inCode = (pos: number) => code.some(([a, b]) => pos >= a && pos < b);

  const edits: { from: number; to: number; insert: string }[] = [];
  for (const m of text.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
    if (inCode(m.index)) continue;
    const next = rewriteWikilink(m[1], ctx);
    if (next !== null) edits.push({ from: m.index + 2, to: m.index + 2 + m[1].length, insert: next });
  }
  for (const [from, to] of urls) {
    const next = rewriteUrl(text.slice(from, to), selfOld, selfNew, ctx);
    if (next !== null) edits.push({ from, to, insert: next });
  }

  edits.sort((a, b) => b.from - a.from);
  for (const e of edits) text = text.slice(0, e.from) + e.insert + text.slice(e.to);
  return text;
}

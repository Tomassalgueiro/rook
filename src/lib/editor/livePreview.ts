// Obsidian-style live preview: styles Markdown in place and hides syntax marks
// (#, **, `, link targets…) except on lines the cursor is on.
import { Facet, StateEffect, StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import type { Tree } from "@lezer/common";
import { GFM, parser } from "@lezer/markdown";
import { headingSlug } from "../notes";
import type { LinkProvider, LinkTarget } from "./types";

const markdown = parser.configure(GFM);

/** Parses Markdown (with GFM) outside an editor. */
export const parseMarkdown = (text: string) => markdown.parse(text);

/** The parsed document. Notes are small, so a full reparse per change is cheap enough. */
const syntax = StateField.define<Tree>({
  create: (state) => markdown.parse(state.doc.toString()),
  update: (tree, tr) => (tr.docChanged ? markdown.parse(tr.state.doc.toString()) : tree),
});

const hide = Decoration.replace({});
const mark = (cls: string) => Decoration.mark({ class: cls });
const line = (cls: string) => Decoration.line({ class: cls });

const inlineStyles: Record<string, string> = {
  StrongEmphasis: "md-strong",
  Emphasis: "md-em",
  Strikethrough: "md-strike",
  InlineCode: "md-code",
  Link: "md-link",
  ListMark: "md-list-mark",
  TaskMarker: "md-task",
  URL: "md-link",
};

const WIKILINK = /\[\[([^\]\n]+)\]\]/g;

/** Marks hidden when their line isn't being edited. */
const syntaxMarks = new Set(["HeaderMark", "EmphasisMark", "CodeMark", "StrikethroughMark", "QuoteMark"]);

const CODE = new Set(["InlineCode", "FencedCode", "CodeBlock"]);

function inCode(tree: Tree, pos: number): boolean {
  for (let n: ReturnType<Tree["resolveInner"]> | null = tree.resolveInner(pos, 1); n; n = n.parent) {
    if (CODE.has(n.name)) return true;
  }
  return false;
}

/** Whether `pos` is on a line being edited, i.e. where syntax is shown. */
export function isLineActive(view: EditorView, pos: number): boolean {
  return activeLines(view).has(view.state.doc.lineAt(pos).number);
}

/** The link under `pos`, if any: a [[wikilink]], [text](url) or bare URL. */
export function linkAt(state: EditorState, pos: number): LinkTarget | null {
  const tree = state.field(syntax);
  if (inCode(tree, pos)) return null;
  const line = state.doc.lineAt(pos);
  for (const m of line.text.matchAll(WIKILINK)) {
    const start = line.from + m.index;
    if (pos >= start && pos <= start + m[0].length) return { kind: "wiki", target: m[1] };
  }
  for (let n: ReturnType<Tree["resolveInner"]> | null = tree.resolveInner(pos, 1); n; n = n.parent) {
    if (n.name === "URL") return { kind: "url", href: state.doc.sliceString(n.from, n.to) };
    if (n.name === "Link") {
      const url = n.getChild("URL");
      return url ? { kind: "url", href: state.doc.sliceString(url.from, url.to) } : null;
    }
  }
  return null;
}

/** Headings in a parsed document; `lineText` returns the text of the line containing a position. */
function collectHeadings(tree: Tree, lineText: (pos: number) => string): { title: string; from: number }[] {
  const out: { title: string; from: number }[] = [];
  tree.iterate({
    enter: (n) => {
      const atx = n.name.startsWith("ATXHeading");
      if (!atx && !n.name.startsWith("SetextHeading")) return;
      const text = lineText(n.from);
      const title = (atx ? text.replace(/^\s*#+\s*/, "").replace(/\s+#+\s*$/, "") : text).trim();
      if (title) out.push({ title, from: n.from });
      return false;
    },
  });
  return out;
}

/** Heading titles of a Markdown text, in order (code blocks excluded). */
export function headingsIn(text: string): string[] {
  const lineText = (pos: number) => {
    const end = text.indexOf("\n", pos);
    return text.slice(text.lastIndexOf("\n", pos - 1) + 1, end < 0 ? text.length : end);
  };
  return collectHeadings(markdown.parse(text), lineText).map((h) => h.title);
}

/** Start of the first heading matching `heading` (by text or slug), or null. */
export function findHeading(state: EditorState, heading: string): number | null {
  const want = headingSlug(heading);
  const headings = collectHeadings(state.field(syntax), (pos) => state.doc.lineAt(pos).text);
  return headings.find((h) => headingSlug(h.title) === want)?.from ?? null;
}

/** Dispatch to restyle links after the vault's notes changed (e.g. a linked note was created). */
export const refreshLinks = StateEffect.define<null>();

/** When true, Markdown syntax is shown on every line instead of only the one being edited. */
export const showSyntax = Facet.define<boolean, boolean>({ combine: (values) => values.some(Boolean) });

/** Line numbers where syntax is shown: the selection's lines (if focused), or all with `showSyntax`. */
function activeLines(view: EditorView): Set<number> {
  const lines = new Set<number>();
  if (view.state.facet(showSyntax)) {
    for (let n = 1; n <= view.state.doc.lines; n++) lines.add(n);
    return lines;
  }
  if (!view.hasFocus) return lines;
  const { doc } = view.state;
  for (const r of view.state.selection.ranges) {
    for (let n = doc.lineAt(r.from).number; n <= doc.lineAt(r.to).number; n++) lines.add(n);
  }
  return lines;
}

function build(view: EditorView, links: LinkProvider): DecorationSet {
  const { state } = view;
  const { doc } = state;
  const tree = state.field(syntax);
  const active = activeLines(view);
  const isActive = (pos: number) => active.has(doc.lineAt(pos).number);
  const decos: Range<Decoration>[] = [];
  const lineClass = (from: number, to: number, cls: string) => {
    for (let n = doc.lineAt(from).number; n <= doc.lineAt(to).number; n++) {
      decos.push(line(cls).range(doc.line(n).from));
    }
  };

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;
        const heading = /^(?:ATX|Setext)Heading(\d)$/.exec(name);
        if (heading) {
          lineClass(node.from, node.to, `md-h${heading[1]}`);
        } else if (name === "FencedCode" || name === "CodeBlock") {
          lineClass(node.from, node.to, "md-codeblock");
          return false;
        } else if (name === "Blockquote") {
          lineClass(node.from, node.to, "md-quote");
        } else if (name === "HorizontalRule") {
          lineClass(node.from, node.to, "md-hr");
          if (!isActive(node.from)) decos.push(hide.range(node.from, node.to));
        } else if (inlineStyles[name] && node.to > node.from) {
          decos.push(mark(inlineStyles[name]).range(node.from, node.to));
        }

        if (isActive(node.from)) return;
        if (syntaxMarks.has(name)) {
          // Also hide the space after "#" or ">" (not after closing ** or `, which is real text).
          const leading = name === "HeaderMark" || name === "QuoteMark";
          const end = leading && doc.sliceString(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
          if (end > node.from) decos.push(hide.range(node.from, end));
        } else if (name === "Link") {
          // [text](url) -> text
          const marks = node.node.getChildren("LinkMark");
          if (marks.length >= 2) {
            decos.push(hide.range(marks[0].from, marks[0].to));
            decos.push(hide.range(marks[1].from, node.to));
          }
        }
      },
    });

    // [[wikilinks]] aren't CommonMark, so match them per line, skipping code.
    for (let pos = from; pos <= to; ) {
      const ln = doc.lineAt(pos);
      for (const m of ln.text.matchAll(WIKILINK)) {
        const start = ln.from + m.index;
        if (inCode(tree, start + 2)) continue;
        const end = start + m[0].length;
        // Links to notes that don't exist yet are dimmed; clicking them creates the note.
        const cls = links.exists(m[1]) ? "md-wikilink" : "md-wikilink md-unresolved";
        decos.push(mark(cls).range(start, end));
        if (!active.has(ln.number)) {
          decos.push(hide.range(start, start + 2), hide.range(end - 2, end));
        }
      }
      pos = ln.to + 1;
    }
  }
  return Decoration.set(decos, true);
}

const decorations = (links: LinkProvider) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view, links);
      }
      update(u: ViewUpdate) {
        const refresh =
          u.transactions.some((tr) => tr.effects.some((e) => e.is(refreshLinks))) ||
          u.startState.facet(showSyntax) !== u.state.facet(showSyntax);
        if (refresh || u.docChanged || u.selectionSet || u.viewportChanged || u.focusChanged) {
          this.decorations = build(u.view, links);
        }
      }
    },
    { decorations: (p) => p.decorations },
  );

/** Line and mark styles; colors and fonts come from the app's CSS variables. */
const theme = EditorView.theme({
  ".md-h1": { fontSize: "1.75em", fontWeight: "700", lineHeight: "1.3", paddingTop: "0.6em" },
  ".md-h2": { fontSize: "1.45em", fontWeight: "650", lineHeight: "1.35", paddingTop: "0.5em" },
  ".md-h3": { fontSize: "1.25em", fontWeight: "600", paddingTop: "0.4em" },
  ".md-h4": { fontSize: "1.1em", fontWeight: "600" },
  ".md-h5, .md-h6": { fontWeight: "600", color: "var(--text-muted)" },
  ".md-strong": { fontWeight: "700" },
  ".md-em": { fontStyle: "italic" },
  ".md-strike": { textDecoration: "line-through", color: "var(--text-muted)" },
  ".md-code": {
    fontFamily: "var(--font-mono)",
    fontSize: "0.9em",
    background: "var(--bg-code)",
    borderRadius: "3px",
    padding: "0.1em 0.25em",
  },
  ".md-codeblock": { fontFamily: "var(--font-mono)", fontSize: "0.9em", background: "var(--bg-code)" },
  ".md-quote": { borderLeft: "2px solid var(--accent)", paddingLeft: "1em", color: "var(--text-muted)" },
  ".md-hr": { borderBottom: "1px solid var(--border)", marginBottom: "0.8em" },
  ".md-link, .md-wikilink": { color: "var(--accent)", cursor: "pointer" },
  ".md-unresolved": { opacity: "0.55" },
  ".md-list-mark, .md-task": { color: "var(--accent)" },
});

export function livePreview(links: LinkProvider) {
  return [syntax, decorations(links), theme];
}


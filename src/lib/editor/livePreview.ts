// Obsidian-style live preview: styles Markdown in place and hides syntax marks
// (#, **, `, link targets…) except on lines the cursor is on.
import { StateField, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import type { Tree } from "@lezer/common";
import { GFM, parser } from "@lezer/markdown";

const markdown = parser.configure(GFM);

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
};

/** Marks hidden when their line isn't being edited. */
const syntaxMarks = new Set(["HeaderMark", "EmphasisMark", "CodeMark", "StrikethroughMark", "QuoteMark"]);

/** Line numbers touched by the selection; empty when the editor isn't focused. */
function activeLines(view: EditorView): Set<number> {
  const lines = new Set<number>();
  if (!view.hasFocus) return lines;
  const { doc } = view.state;
  for (const r of view.state.selection.ranges) {
    for (let n = doc.lineAt(r.from).number; n <= doc.lineAt(r.to).number; n++) lines.add(n);
  }
  return lines;
}

function build(view: EditorView): DecorationSet {
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
          // Also hide the space after "#" or ">".
          const end = doc.sliceString(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
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
      for (const m of ln.text.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
        const start = ln.from + m.index;
        const inner = tree.resolveInner(start + 2, 1);
        let inCode = false;
        for (let n: typeof inner | null = inner; n; n = n.parent) {
          if (n.name === "InlineCode" || n.name === "FencedCode" || n.name === "CodeBlock") inCode = true;
        }
        if (inCode) continue;
        const end = start + m[0].length;
        decos.push(mark("md-wikilink").range(start, end));
        if (!active.has(ln.number)) {
          decos.push(hide.range(start, start + 2), hide.range(end - 2, end));
        }
      }
      pos = ln.to + 1;
    }
  }
  return Decoration.set(decos, true);
}

const decorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged || u.focusChanged) {
        this.decorations = build(u.view);
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
  ".md-link, .md-wikilink": { color: "var(--accent)" },
  ".md-list-mark, .md-task": { color: "var(--accent)" },
});

export function livePreview() {
  return [syntax, decorations, theme];
}


import { Annotation, EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { isLineActive, linkAt, livePreview, type LinkTarget } from "./livePreview";

export type { LinkTarget };

/** Marks programmatic content replacement, which isn't a user edit. */
const external = Annotation.define<boolean>();

const chrome = EditorView.theme({
  "&": { color: "var(--text)", fontSize: "16px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-text)", lineHeight: "1.7", overflow: "visible" },
  ".cm-content": { padding: "0 0 40vh", caretColor: "var(--accent)" },
  ".cm-line": { padding: "0" },
  ".cm-cursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    background: "var(--selection) !important",
  },
});

/** A minimal Markdown editor: no gutters, soft-wrapped, live preview. */
export function createEditor(
  parent: HTMLElement,
  doc: string,
  onchange: (text: string) => void,
  onlink: (link: LinkTarget) => void,
): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ spellcheck: "false", "aria-label": "Note content" }),
        chrome,
        livePreview(),
        // Click opens a rendered link; on the line being edited it needs Ctrl/Cmd+click.
        EditorView.domEventHandlers({
          mousedown(e, view) {
            if (e.button !== 0) return false;
            const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
            if (pos === null) return false;
            if (!(e.ctrlKey || e.metaKey) && isLineActive(view, pos)) return false;
            const link = linkAt(view.state, pos);
            if (!link) return false;
            e.preventDefault();
            onlink(link);
            return true;
          },
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !u.transactions.some((tr) => tr.annotation(external))) {
            onchange(u.state.doc.toString());
          }
        }),
      ],
    }),
  });
}

/** Replaces the whole document (e.g. after reloading from disk) without an undo step or change event. */
export function setContent(view: EditorView, text: string) {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    annotations: [external.of(true), Transaction.addToHistory.of(false)],
  });
}

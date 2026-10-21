import { Annotation, Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { findHeading, isLineActive, linkAt, livePreview, refreshLinks, showSyntax } from "./livePreview";
import { wikilinkCompletion } from "./completion";
import type { LinkProvider, LinkTarget } from "./types";
import { attachVim, vimExtension, type VimHooks } from "./vim";

export type { LinkOption, LinkProvider, LinkTarget } from "./types";

/** Marks programmatic content replacement, which isn't a user edit. */
const external = Annotation.define<boolean>();

const chrome = EditorView.theme({
  "&": { color: "var(--text)", fontSize: "var(--editor-size, 16px)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-text)", lineHeight: "1.7", overflow: "visible" },
  ".cm-content": { padding: "0 0 40vh", caretColor: "var(--accent)" },
  ".cm-line": { padding: "0" },
  ".cm-cursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    background: "var(--selection) !important",
  },
});

/** Settings that can change while the editor is open (see `setOptions`). */
export interface EditorOptions {
  /** Show Markdown syntax on every line, not just the one being edited. */
  showSyntax: boolean;
  spellcheck: boolean;
}

export interface EditorConfig extends EditorOptions {
  onchange: (text: string) => void;
  onlink: (link: LinkTarget) => void;
  links: LinkProvider;
}

const syntaxOption = new Compartment();
const spellcheckOption = new Compartment();
const vimOption = new Compartment();

const syntaxExt = (on: boolean) => showSyntax.of(on);
const spellcheckExt = (on: boolean) => EditorView.contentAttributes.of({ spellcheck: on ? "true" : "false" });

/** A minimal Markdown editor: no gutters, soft-wrapped, live preview. */
export function createEditor(parent: HTMLElement, doc: string, config: EditorConfig): EditorView {
  const { onchange, onlink, links } = config;
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        vimOption.of([]),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ "aria-label": "Note content" }),
        syntaxOption.of(syntaxExt(config.showSyntax)),
        spellcheckOption.of(spellcheckExt(config.spellcheck)),
        chrome,
        livePreview(links),
        wikilinkCompletion(links),
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

/** Applies changed settings to an open editor. */
export function setOptions(view: EditorView, options: EditorOptions) {
  view.dispatch({
    effects: [
      syntaxOption.reconfigure(syntaxExt(options.showSyntax)),
      spellcheckOption.reconfigure(spellcheckExt(options.spellcheck)),
    ],
  });
}

/** Turns Vim keybindings on or off; the Vim package is loaded on first use. */
export async function setVim(view: EditorView, on: boolean, hooks: VimHooks) {
  if (!on) {
    view.dispatch({ effects: vimOption.reconfigure([]) });
    hooks.onmode(null);
    return;
  }
  const extension = await vimExtension();
  if (!view.dom.isConnected) return; // the note was closed while loading
  view.dispatch({ effects: vimOption.reconfigure(extension) });
  await attachVim(view, hooks);
}

/** Selects text[from, to), scrolls it into view and focuses the editor so the selection shows. */
export function selectRange(view: EditorView, from: number, to: number) {
  const max = view.state.doc.length;
  view.dispatch({
    selection: { anchor: Math.min(from, max), head: Math.min(to, max) },
    effects: EditorView.scrollIntoView(Math.min(from, max), { y: "center" }),
  });
  view.focus();
}

/** Restyles links, e.g. after a linked note was created or renamed. */
export function restyleLinks(view: EditorView) {
  view.dispatch({ effects: refreshLinks.of(null) });
}

/** Moves the cursor to a heading and scrolls it to the top; false if there's no such heading. */
export function scrollToHeading(view: EditorView, heading: string): boolean {
  const pos = findHeading(view.state, heading);
  if (pos === null) return false;
  view.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: "start", yMargin: 48 }),
  });
  return true;
}

/** Replaces the whole document (e.g. after reloading from disk) without an undo step or change event. */
export function setContent(view: EditorView, text: string) {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    annotations: [external.of(true), Transaction.addToHistory.of(false)],
  });
}

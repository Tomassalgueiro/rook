// Optional Vim keybindings. The package is loaded only when Vim mode is first enabled.
import { Prec, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

type VimModule = typeof import("@replit/codemirror-vim");

export interface VimHooks {
  /** `:w`, `:wq`, `:x`. */
  onsave: () => void;
  /** "normal", "insert", "visual", "visual line"…, or null when Vim mode is off. */
  onmode: (mode: string | null) => void;
}

let module: Promise<VimModule> | null = null;
const hooks = new WeakMap<EditorView, VimHooks>();

function load(): Promise<VimModule> {
  module ??= import("@replit/codemirror-vim").then((vim) => {
    // Ex commands are global in the Vim package; route them to the editor they ran in.
    const save = (cm: { cm6: EditorView }) => hooks.get(cm.cm6)?.onsave();
    vim.Vim.defineEx("write", "w", save);
    vim.Vim.defineEx("wq", "wq", save);
    vim.Vim.defineEx("xit", "x", save);
    vim.Vim.defineMotion("moveByLines", moveByLines(vim.CodeMirror.Pos));
    return vim;
  });
  return module;
}

/**
 * j/k (and +, -, Enter) by logical lines. Same as the stock motion, except it never moves by
 * screen coordinates: the stock one also does a visual-line move meant for folded text and
 * jumps wherever that lands, which can misfire (e.g. to the top of the note) with live
 * preview's hidden syntax. Rook has no folding, so logical lines are all j/k need.
 * (`any`: the Vim package's motion internals are untyped.)
 */
function moveByLines(Pos: VimModule["CodeMirror"]["Pos"]): any {
  return function (this: any, cm: any, head: any, args: any, state: any) {
    let ch = head.ch;
    // After a vertical move, keep the remembered column (Infinity after $ sticks to line ends).
    const vertical = [this.moveByLines, this.moveByDisplayLines, this.moveByScroll, this.moveToColumn, this.moveToEol];
    if (vertical.includes(state.lastMotion)) ch = state.lastHPos;
    else state.lastHPos = ch;

    const repeat = args.repeat + (args.repeatOffset || 0);
    const first = cm.firstLine();
    const last = cm.lastLine();
    const wanted = args.forward ? head.line + repeat : head.line - repeat;
    // Like Vim: past the first/last line, go to the start/end of that line.
    if (wanted < first && head.line === first) return new Pos(first, 0);
    if (wanted > last && head.line === last) return new Pos(last, Infinity);
    const line = Math.min(last, Math.max(first, wanted));

    if (args.toFirstChar) {
      ch = cm.getLine(line).search(/\S|$/);
      state.lastHPos = ch;
    }
    state.lastHSPos = cm.charCoords(new Pos(line, ch), "div").left;
    return new Pos(line, ch);
  };
}

const cursor = EditorView.theme({
  ".cm-fat-cursor": { background: "var(--accent) !important", color: "var(--bg) !important" },
  "&:not(.cm-focused) .cm-fat-cursor": {
    background: "none !important",
    outline: "solid 1px var(--accent) !important",
  },
});

/**
 * The Vim extension. Highest precedence, so Vim wins any key it uses; Rook's shortcuts
 * only see keys Vim leaves alone (see the page's keydown handler).
 */
export async function vimExtension(): Promise<Extension> {
  const { vim } = await load();
  return [Prec.highest(vim({ status: false })), cursor];
}

/** Call after the extension is installed: wires `:w` and mode reporting for this editor. */
export async function attachVim(view: EditorView, vimHooks: VimHooks) {
  const { getCM } = await load();
  hooks.set(view, vimHooks);
  getCM(view)?.on("vim-mode-change", (e: { mode: string; subMode?: string }) => {
    vimHooks.onmode(e.subMode ? `${e.mode} ${e.subMode === "linewise" ? "line" : "block"}` : e.mode);
  });
  vimHooks.onmode("normal");
}

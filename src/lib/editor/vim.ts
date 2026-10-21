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
    return vim;
  });
  return module;
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

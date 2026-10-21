// [[wikilink]] autocomplete: typing "[[" suggests notes and files in the vault.
import {
  autocompletion,
  pickedCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";

export interface LinkOption {
  /** Text inserted between the brackets: a note title, a path if titles clash, or a file name. */
  label: string;
  /** Shown dimmed next to the label, e.g. the folder. */
  detail?: string;
}

/** Inserts the link target and closes the brackets unless "]]" already follows. */
function applyLink(view: EditorView, completion: Completion, from: number, to: number) {
  const closed = view.state.sliceDoc(to, to + 2) === "]]";
  view.dispatch({
    changes: { from, to, insert: closed ? completion.label : `${completion.label}]]` },
    selection: { anchor: from + completion.label.length + 2 },
    annotations: pickedCompletion.of(completion),
  });
}

/** Completion source active right after "[[" (until "]", "|" or "#"). */
export const wikilinkSource =
  (options: () => LinkOption[]) =>
  (ctx: CompletionContext): CompletionResult | null => {
    const match = ctx.matchBefore(/\[\[[^\]|#\n]*$/);
    if (!match) return null;
    return {
      from: match.from + 2,
      options: options().map((o) => ({ label: o.label, detail: o.detail, apply: applyLink })),
      validFor: /^[^\]|#\n]*$/,
    };
  };

export function wikilinkCompletion(options: () => LinkOption[]) {
  return [
    autocompletion({ override: [wikilinkSource(options)], icons: false }),
    EditorView.theme({
      ".cm-tooltip.cm-tooltip-autocomplete": {
        background: "var(--bg-alt)",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        padding: "4px",
        fontFamily: "var(--font-ui)",
        fontSize: "13px",
        boxShadow: "0 8px 24px rgb(0 0 0 / 0.35)",
      },
      ".cm-tooltip.cm-tooltip-autocomplete > ul": { maxHeight: "16em", minWidth: "220px" },
      ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
        padding: "3px 8px",
        borderRadius: "4px",
        color: "var(--text-muted)",
      },
      ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
        background: "var(--bg-active)",
        color: "var(--text)",
      },
      ".cm-completionMatchedText": { textDecoration: "none", color: "var(--accent)" },
      ".cm-completionDetail": { marginLeft: "12px", fontStyle: "normal", color: "var(--text-faint)" },
    }),
  ];
}

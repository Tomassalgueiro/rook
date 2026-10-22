// [[wikilink]] autocomplete: typing "[[" suggests notes and files in the vault.
import {
  autocompletion,
  pickedCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import type { LinkProvider } from "./types";

/** Inserts `target` and closes the brackets unless "]]" already follows. */
function insertLink(view: EditorView, completion: Completion, target: string, from: number, to: number) {
  const closed = view.state.sliceDoc(to, to + 2) === "]]";
  view.dispatch({
    changes: { from, to, insert: closed ? target : `${target}]]` },
    selection: { anchor: from + target.length + 2 },
    annotations: pickedCompletion.of(completion),
  });
}

const applyLink = (view: EditorView, completion: Completion, from: number, to: number) =>
  insertLink(view, completion, completion.label, from, to);

/**
 * Completion source for wikilinks:
 * - "[[Note#" / "[[#": headings of that note (or the current one);
 * - "[[": notes and files. When the typed name matches none, a last "Create note" entry hints
 *   that following the link will create it.
 * No `validFor`, so the source re-runs per keystroke and that entry stays current.
 */
export const wikilinkSource =
  (links: LinkProvider) =>
  (ctx: CompletionContext): CompletionResult | null => {
    const heading = ctx.matchBefore(/\[\[[^\]|#\n]*#[^\]|#\n]*$/);
    if (heading) {
      const hash = heading.text.indexOf("#");
      const titles = [...new Set(links.headings(heading.text.slice(2, hash).trim()))];
      return { from: heading.from + hash + 1, options: titles.map((label) => ({ label, apply: applyLink })) };
    }

    const match = ctx.matchBefore(/\[\[[^\]|#\n]*$/);
    if (!match) return null;
    const all = links.targets();
    const typed = match.text.slice(2).trim();
    const result: Completion[] = all.map((o) => ({ label: o.label, detail: o.detail, apply: applyLink }));
    if (typed && !all.some((o) => o.label.toLowerCase() === typed.toLowerCase())) {
      // The label isn't just `typed`: an exact match would outrank every real note despite the boost.
      result.push({
        label: `Create note “${typed}”`,
        detail: "new",
        apply: (view, completion, from, to) => insertLink(view, completion, typed, from, to),
        boost: -99,
        type: "create",
      });
    }
    return { from: match.from + 2, options: result };
  };

export function wikilinkCompletion(links: LinkProvider) {
  return [
    autocompletion({
      override: [wikilinkSource(links)],
      icons: false,
      optionClass: (c) => (c.type === "create" ? "cm-create-note" : ""),
    }),
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
      ".cm-tooltip.cm-tooltip-autocomplete > ul > li.cm-create-note": { color: "var(--accent)" },
    }),
  ];
}

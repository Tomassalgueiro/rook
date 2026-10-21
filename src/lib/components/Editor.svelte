<script lang="ts">
  import { onMount } from "svelte";
  import type { EditorView } from "@codemirror/view";
  import type { Note } from "../types";
  import { noteTitle } from "../notes";
  import {
    createEditor,
    restyleLinks,
    scrollToHeading as scrollViewToHeading,
    selectRange as selectViewRange,
    setContent,
    setOptions,
    setVim,
    type EditorOptions,
    type LinkProvider,
    type LinkTarget,
  } from "../editor/setup";
  import Icon from "./Icon.svelte";

  interface Props {
    note: Note;
    onedit: () => void;
    onlink: (link: LinkTarget) => void;
    links: LinkProvider;
    /** Changes whenever the set of notes/files changes, so link styling can refresh. */
    linkKey: string;
    options: EditorOptions;
    vim: boolean;
    /** `:w` in Vim mode. */
    onsave: () => void;
    /** Resolves false if the rename failed, so the title is reset. */
    onrename: (title: string) => Promise<boolean>;
    ondelete: () => void;
  }
  let {
    note = $bindable(),
    onedit,
    onlink,
    links,
    linkKey,
    options,
    vim,
    onsave,
    onrename,
    ondelete,
  }: Props = $props();

  let title = $derived(noteTitle(note.path));
  let host = $state<HTMLDivElement>();
  let view: EditorView | undefined;

  onMount(() => {
    if (!host) return;
    view = createEditor(host, note.content, {
      ...options,
      onchange: (text) => {
        note.content = text;
        onedit();
      },
      onlink,
      links,
    });
    return () => view?.destroy();
  });

  // Pull in content replaced from outside, e.g. "Reload from disk" or an external edit.
  $effect(() => {
    const text = note.content;
    if (view && text !== view.state.doc.toString()) setContent(view, text);
  });

  /** Selects a range of this note's text (e.g. a search match) and scrolls to it. */
  export function selectRange(from: number, to: number) {
    if (view) selectViewRange(view, from, to);
  }

  /** Scrolls to a heading in this note; false if it doesn't exist. */
  export function scrollToHeading(heading: string): boolean {
    return view ? scrollViewToHeading(view, heading) : false;
  }

  $effect(() => {
    void linkKey;
    if (view) restyleLinks(view);
  });

  $effect(() => {
    const next = { showSyntax: options.showSyntax, spellcheck: options.spellcheck };
    if (view) setOptions(view, next);
  });

  $effect(() => {
    const on = vim;
    if (view) setVim(view, on, { onsave });
  });

  async function commitTitle() {
    const next = title.trim();
    const current = noteTitle(note.path);
    if (!next || next === current || !(await onrename(next))) title = current;
  }

  function onTitleKey(e: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    if (e.key === "Escape") title = noteTitle(note.path);
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      e.currentTarget.blur();
      if (e.key === "Enter") view?.focus();
    }
  }
</script>

<section>
  <header>
    <input class="title" bind:value={title} onblur={commitTitle} onkeydown={onTitleKey} aria-label="Note title" />
    <button class="icon" title="Delete note" aria-label="Delete note" onclick={ondelete}><Icon name="trash" /></button>
  </header>
  {#if note.error}
    <p class="muted">This note can't be edited in Rook: {note.error}</p>
  {:else}
    <div class="body" bind:this={host}></div>
  {/if}
</section>

<style>
  section {
    flex: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: var(--content-width, 720px);
    margin: 0 auto;
    padding: 48px 40px 0;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 20px;
  }
  .title {
    flex: 1;
    min-width: 0;
    font: inherit;
    font-size: 30px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.2;
    color: inherit;
    background: transparent;
    border: 0;
    padding: 0;
  }
  .title:focus-visible {
    outline: none;
  }
  header .icon {
    color: var(--text-faint);
    opacity: 0;
  }
  header:hover .icon,
  header .icon:focus-visible {
    opacity: 1;
  }
  header .icon:hover {
    color: var(--danger);
  }
  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .body :global(.cm-editor) {
    flex: 1;
  }
  @media (max-width: 640px) {
    section {
      padding: 24px 16px 0;
    }
  }
</style>

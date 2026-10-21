<script lang="ts">
  import type { Note } from "../types";
  import { noteTitle } from "../notes";

  interface Props {
    note: Note;
    onedit: () => void;
    /** Resolves false if the rename failed, so the title is reset. */
    onrename: (title: string) => Promise<boolean>;
    ondelete: () => void;
  }
  let { note = $bindable(), onedit, onrename, ondelete }: Props = $props();

  let title = $derived(noteTitle(note.path));

  async function commitTitle() {
    const next = title.trim();
    const current = noteTitle(note.path);
    if (!next || next === current || !(await onrename(next))) title = current;
  }

  function onTitleKey(e: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    if (e.key === "Escape") title = noteTitle(note.path);
    if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
  }
</script>

<section>
  <header>
    <input class="title" bind:value={title} onblur={commitTitle} onkeydown={onTitleKey} aria-label="Note title" />
    <button class="muted" title="Delete note" onclick={ondelete}>Delete</button>
  </header>
  {#if note.error}
    <p class="muted">This note can't be edited in Rook: {note.error}</p>
  {:else}
    <textarea bind:value={note.content} oninput={onedit} spellcheck="false" aria-label="Note content"></textarea>
  {/if}
</section>

<style>
  section {
    flex: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 760px;
    margin: 0 auto;
    padding: 24px 32px 0;
    min-height: 0;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 12px;
  }
  .title {
    flex: 1;
    min-width: 0;
    font: inherit;
    font-size: 24px;
    font-weight: 600;
    line-height: 1.3;
    color: inherit;
    background: transparent;
    border: 0;
    padding: 0;
  }
  .title:focus-visible {
    outline: none;
  }
  textarea {
    flex: 1;
    resize: none;
    border: 0;
    padding: 0 0 24px;
    font: 15px/1.7 ui-monospace, "SF Mono", Menlo, monospace;
    color: inherit;
    background: transparent;
  }
  textarea:focus-visible {
    outline: none;
  }
  @media (max-width: 640px) {
    section {
      padding: 16px 16px 0;
    }
  }
</style>

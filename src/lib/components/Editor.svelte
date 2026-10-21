<script lang="ts">
  import type { Note } from "../types";
  import { noteTitle } from "../notes";

  let { note = $bindable() }: { note: Note } = $props();
</script>

<section>
  <h1>{noteTitle(note.path)}</h1>
  <!-- Placeholder editor: edits stay in memory until the vault API exists. -->
  <textarea bind:value={note.content} spellcheck="false" aria-label="Note content"></textarea>
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
  h1 {
    margin: 0 0 12px;
    font-size: 24px;
    font-weight: 600;
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

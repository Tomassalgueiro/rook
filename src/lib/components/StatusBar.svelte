<script lang="ts">
  interface Props {
    noteCount: number | null;
    words: number | null;
    status: string;
    /** Vim mode, or null when Vim is off. */
    mode: string | null;
  }
  let { noteCount, words, status, mode }: Props = $props();
</script>

<footer>
  {#if mode}<span class="mode" class:insert={mode === "insert"} class:visual={mode.startsWith("visual")}>{mode}</span>{/if}
  <span class="status" title={status}>{status}</span>
  <span>{noteCount === null ? "No vault" : `${noteCount} notes`}</span>
  {#if words !== null}<span>{words} words</span>{/if}
</footer>

<style>
  footer {
    display: flex;
    gap: 16px;
    height: 22px;
    padding: 0 12px;
    font-size: 12px;
    line-height: 22px;
    color: var(--text-muted);
    background: var(--bg-alt);
    border-top: 1px solid var(--border);
    white-space: nowrap;
  }
  .mode {
    font: 600 10.5px/22px var(--font-mono);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .mode.insert {
    color: var(--accent);
  }
  .mode.visual {
    color: var(--file-video);
  }
  .status {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>

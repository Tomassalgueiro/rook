<script lang="ts">
  interface Props {
    noteCount: number | null;
    words: number | null;
    status: string;
  }
  let { noteCount, words, status }: Props = $props();
</script>

<footer>
  <span class="status" title={status}>{status}</span>
  <span>{noteCount === null ? "No vault" : `${noteCount} notes`}</span>
  {#if words !== null}<span>{words} words</span>{/if}
</footer>

<style>
  footer {
    display: flex;
    gap: 16px;
    height: 26px;
    padding: 0 12px;
    font-size: 15.5px;
    line-height: 26px;
    color: var(--text-muted);
    background: var(--bg-alt);
    border-top: 1px solid var(--border);
    white-space: nowrap;
  }
  .status {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>

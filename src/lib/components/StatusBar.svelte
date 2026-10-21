<script lang="ts">
  let { noteCount, words }: { noteCount: number | null; words: number | null } = $props();
</script>

<footer>
  <span>{noteCount === null ? "No vault" : `${noteCount} notes`}</span>
  {#if words !== null}<span>{words} words</span>{/if}
</footer>

<style>
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 16px;
    height: 22px;
    padding: 0 12px;
    font-size: 12px;
    line-height: 22px;
    color: var(--text-muted);
    background: var(--bg-alt);
    border-top: 1px solid var(--border);
  }
</style>

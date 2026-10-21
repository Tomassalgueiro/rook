<script lang="ts">
  import type { Snippet } from "svelte";
  let { title, children }: { title: string; children?: Snippet } = $props();
</script>

<div>
  <h2>{title}</h2>
  {@render children?.()}
</div>

<style>
  div {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--text-muted);
    text-align: center;
    padding: 16px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 500;
    color: var(--text);
  }
</style>

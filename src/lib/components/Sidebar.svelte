<script lang="ts">
  import type { TreeNode } from "../types";
  import NoteTree from "./NoteTree.svelte";

  interface Props {
    vaultName: string;
    tree: TreeNode[];
    activePath: string | null;
    onselect: (path: string) => void;
    onclosevault: () => void;
  }
  let { vaultName, tree, activePath, onselect, onclosevault }: Props = $props();
</script>

<aside>
  <header>
    <strong title={vaultName}>{vaultName}</strong>
    <button class="muted" title="Close vault" onclick={onclosevault}>✕</button>
  </header>
  <nav>
    {#if tree.length}
      <NoteTree nodes={tree} {activePath} {onselect} />
    {:else}
      <p class="muted empty">No matching notes</p>
    {/if}
  </nav>
</aside>

<style>
  aside {
    display: flex;
    flex-direction: column;
    width: var(--sidebar-w);
    min-width: 0;
    background: var(--bg-alt);
    border-right: 1px solid var(--border);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--bar-h);
    padding: 0 4px 0 12px;
    border-bottom: 1px solid var(--border);
  }
  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  nav {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }
  .empty {
    padding: 0 12px;
  }
</style>

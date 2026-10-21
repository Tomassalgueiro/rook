<script lang="ts">
  import type { FolderAction, TreeNode } from "../types";
  import NoteTree from "./NoteTree.svelte";

  interface Props {
    vaultName: string;
    tree: TreeNode[];
    activePath: string | null;
    emptyMessage: string;
    onselect: (path: string) => void;
    onfolderaction: (action: FolderAction, path: string) => void;
    onclosevault: () => void;
  }
  let { vaultName, tree, activePath, emptyMessage, onselect, onfolderaction, onclosevault }: Props = $props();
</script>

<aside>
  <header>
    <strong title={vaultName}>{vaultName}</strong>
    <span>
      <button class="muted" title="New folder" onclick={() => onfolderaction("folder", "")}>⊞</button>
      <button class="muted" title="Close vault" onclick={onclosevault}>✕</button>
    </span>
  </header>
  <nav>
    {#if tree.length}
      <NoteTree nodes={tree} {activePath} {onselect} {onfolderaction} />
    {:else}
      <p class="muted empty">{emptyMessage}</p>
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
  header span {
    display: flex;
    flex-shrink: 0;
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

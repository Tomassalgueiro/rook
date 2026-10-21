<script lang="ts">
  import type { FolderAction, TreeNode } from "../types";
  import Icon from "./Icon.svelte";
  import NoteTree from "./NoteTree.svelte";

  interface Props {
    vaultName: string;
    vaultPath: string;
    tree: TreeNode[];
    activePath: string | null;
    searching: boolean;
    onselect: (path: string) => void;
    onopenfile: (path: string) => void;
    onnewnote: () => void;
    onfolderaction: (action: FolderAction, path: string) => void;
    onclosevault: () => void;
  }
  let {
    vaultName,
    vaultPath,
    tree,
    activePath,
    searching,
    onselect,
    onopenfile,
    onnewnote,
    onfolderaction,
    onclosevault,
  }: Props = $props();

  let expanded = $state<Record<string, boolean>>({});
</script>

<aside>
  <header>
    <span class="vault" title={vaultPath}><Icon name="vault" size={15} /><strong>{vaultName}</strong></span>
    <button class="icon" title="New note (Ctrl+N)" aria-label="New note" onclick={onnewnote}>
      <Icon name="file-plus" />
    </button>
    <button class="icon" title="New folder (Ctrl+Shift+N)" aria-label="New folder" onclick={() => onfolderaction("folder", "")}>
      <Icon name="folder-plus" />
    </button>
    <button class="icon" title="Close vault" aria-label="Close vault" onclick={onclosevault}>
      <Icon name="log-out" />
    </button>
  </header>
  <nav>
    {#if tree.length}
      <NoteTree
        nodes={tree}
        {activePath}
        {expanded}
        forceOpen={searching}
        {onselect}
        {onopenfile}
        ontoggle={(path, open) => (expanded[path] = open)}
        {onfolderaction}
      />
    {:else}
      <p class="empty">{searching ? "No matching notes" : "No notes yet"}</p>
    {/if}
  </nav>
</aside>

<style>
  aside {
    display: flex;
    flex-direction: column;
    flex: 0 0 var(--sidebar-w);
    min-width: 0;
    background: var(--bg-alt);
  }
  header {
    display: flex;
    align-items: center;
    gap: 2px;
    height: var(--bar-h);
    padding: 0 6px 0 12px;
  }
  .vault {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-faint);
  }
  strong {
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  header .icon {
    color: var(--text-faint);
  }
  header .icon:hover {
    color: var(--text);
  }
  nav {
    flex: 1;
    overflow-y: auto;
    padding: 4px 6px 12px;
  }
  .empty {
    padding: 0 8px;
    color: var(--text-faint);
  }
</style>

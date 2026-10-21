<script lang="ts">
  import type { FolderAction, TreeNode } from "../types";
  import NoteTree from "./NoteTree.svelte";

  interface Props {
    nodes: TreeNode[];
    activePath: string | null;
    onselect: (path: string) => void;
    onfolderaction: (action: FolderAction, path: string) => void;
    depth?: number;
  }
  let { nodes, activePath, onselect, onfolderaction, depth = 0 }: Props = $props();

  let collapsed = $state<Record<string, boolean>>({});

  const actions: [FolderAction, string, string][] = [
    ["note", "＋", "New note here"],
    ["folder", "⊞", "New subfolder"],
    ["rename", "✎", "Rename or move folder"],
    ["delete", "✕", "Delete folder"],
  ];
</script>

<ul>
  {#each nodes as node (node.path)}
    <li>
      {#if node.kind === "folder"}
        <div class="folder">
          <button
            class="row"
            style:padding-left="{8 + depth * 12}px"
            aria-expanded={!collapsed[node.path]}
            onclick={() => (collapsed[node.path] = !collapsed[node.path])}
          >
            <span class="caret">{collapsed[node.path] ? "▸" : "▾"}</span>{node.name}
          </button>
          <span class="actions">
            {#each actions as [action, icon, label] (action)}
              <button title={label} aria-label="{label}: {node.name}" onclick={() => onfolderaction(action, node.path)}
                >{icon}</button
              >
            {/each}
          </span>
        </div>
        {#if !collapsed[node.path]}
          <NoteTree nodes={node.children} {activePath} {onselect} {onfolderaction} depth={depth + 1} />
        {/if}
      {:else}
        <button
          class="row note"
          class:active={node.path === activePath}
          style:padding-left="{8 + depth * 12 + 14}px"
          onclick={() => onselect(node.path)}
        >
          {node.name}
        </button>
      {/if}
    </li>
  {/each}
</ul>

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .row {
    display: block;
    width: 100%;
    text-align: left;
    border-radius: 0;
    padding-block: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .folder {
    display: flex;
  }
  .folder:hover {
    background: var(--bg-hover);
  }
  .folder .row {
    flex: 1;
    min-width: 0;
  }
  .actions {
    display: none;
    flex-shrink: 0;
    padding-right: 4px;
  }
  .folder:hover .actions,
  .folder:focus-within .actions {
    display: flex;
  }
  .actions button {
    padding: 0 4px;
    color: var(--text-muted);
  }
  .actions button:hover {
    color: var(--text);
  }
  .caret {
    display: inline-block;
    width: 14px;
    color: var(--text-muted);
  }
  .note {
    color: var(--text-muted);
  }
  .note.active {
    color: var(--text);
    background: var(--bg-active);
  }
</style>

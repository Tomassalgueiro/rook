<script lang="ts">
  import type { TreeNode } from "../types";
  import NoteTree from "./NoteTree.svelte";

  interface Props {
    nodes: TreeNode[];
    activePath: string | null;
    onselect: (path: string) => void;
    depth?: number;
  }
  let { nodes, activePath, onselect, depth = 0 }: Props = $props();

  let collapsed = $state<Record<string, boolean>>({});
</script>

<ul>
  {#each nodes as node (node.path)}
    <li>
      {#if node.kind === "folder"}
        <button
          class="row"
          style:padding-left="{8 + depth * 12}px"
          aria-expanded={!collapsed[node.path]}
          onclick={() => (collapsed[node.path] = !collapsed[node.path])}
        >
          <span class="caret">{collapsed[node.path] ? "▸" : "▾"}</span>{node.name}
        </button>
        {#if !collapsed[node.path]}
          <NoteTree nodes={node.children} {activePath} {onselect} depth={depth + 1} />
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

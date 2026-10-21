<script lang="ts">
  import type { FolderAction, TreeNode } from "../types";
  import type { FileKind } from "../vault";
  import Icon, { type IconName } from "./Icon.svelte";
  import NoteTree from "./NoteTree.svelte";

  interface Props {
    nodes: TreeNode[];
    activePath: string | null;
    /** Folders the user opened (true) or closed (false); unset folders follow the default. */
    expanded: Record<string, boolean>;
    /** Open every folder, e.g. while searching. */
    forceOpen: boolean;
    /** Folder highlighted as the current drop target while dragging. */
    dropTarget: string | null;
    onselect: (path: string) => void;
    onopenfile: (path: string) => void;
    ontoggle: (path: string, open: boolean) => void;
    onfolderaction: (action: FolderAction, path: string) => void;
    depth?: number;
  }
  let {
    nodes,
    activePath,
    expanded,
    forceOpen,
    dropTarget,
    onselect,
    onopenfile,
    ontoggle,
    onfolderaction,
    depth = 0,
  }: Props = $props();

  const fileIcons: Record<FileKind, IconName> = { pdf: "file-pdf", image: "image", video: "film" };

  // Folders start closed, except the ones leading to the open note.
  const isOpen = (path: string) =>
    forceOpen || (expanded[path] ?? (activePath?.startsWith(`${path}/`) ?? false));

  const actions: [FolderAction, IconName, string][] = [
    ["note", "file-plus", "New note here"],
    ["folder", "folder-plus", "New subfolder"],
    ["rename", "pencil", "Rename or move folder"],
    ["delete", "trash", "Delete folder"],
  ];
</script>

<ul>
  {#each nodes as node (node.path)}
    {@const indent = `${8 + depth * 14}px`}
    <li>
      {#if node.kind === "folder"}
        {@const open = isOpen(node.path)}
        <div
          class="row folder"
          class:drop={dropTarget === node.path}
          data-drag-path={node.path}
          data-drag-kind="folder"
          data-drag-name={node.name}
        >
          <button
            class="label"
            style:padding-left={indent}
            aria-expanded={open}
            onclick={() => ontoggle(node.path, !open)}
          >
            <span class="chevron" class:open><Icon name="chevron" size={12} /></span>
            <Icon name={open ? "folder-open" : "folder"} size={15} />
            <span class="name">{node.name}</span>
          </button>
          <span class="actions">
            {#each actions as [action, icon, label] (action)}
              <button class="icon" title={label} aria-label="{label}: {node.name}" onclick={() => onfolderaction(action, node.path)}>
                <Icon name={icon} size={14} />
              </button>
            {/each}
          </span>
        </div>
        {#if open}
          <NoteTree
            nodes={node.children}
            {activePath}
            {expanded}
            {forceOpen}
            {dropTarget}
            {onselect}
            {onopenfile}
            {ontoggle}
            {onfolderaction}
            depth={depth + 1}
          />
        {/if}
      {:else if node.kind === "file"}
        <button
          class="row label file {node.type}"
          style:padding-left={indent}
          data-drag-path={node.path}
          data-drag-kind="file"
          data-drag-name="{node.name}.{node.ext}"
          title="Open {node.name}.{node.ext} in the default app"
          onclick={() => onopenfile(node.path)}
        >
          <span class="chevron"></span>
          <Icon name={fileIcons[node.type]} size={15} />
          <span class="name">{node.name}</span>
          <span class="ext">{node.ext}</span>
        </button>
      {:else}
        <button
          class="row label note"
          class:active={node.path === activePath}
          style:padding-left={indent}
          data-drag-path={node.path}
          data-drag-kind="note"
          data-drag-name={node.name}
          aria-current={node.path === activePath ? "page" : undefined}
          onclick={() => onselect(node.path)}
        >
          <span class="chevron"></span>
          <Icon name="file" size={15} />
          <span class="name">{node.name}</span>
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
    display: flex;
    align-items: center;
    width: 100%;
    margin: 1px 0;
    border-radius: var(--radius);
  }
  .row:hover {
    background: var(--bg-hover);
  }
  .row.drop {
    background: var(--bg-active);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .label {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding-block: 3px;
    padding-right: 8px;
    text-align: left;
    color: var(--text-muted);
    background: none;
  }
  .label :global(svg) {
    color: var(--text-faint);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chevron {
    width: 12px;
    flex-shrink: 0;
    color: var(--text-faint);
    transform-origin: center;
  }
  .chevron.open {
    transform: rotate(90deg);
  }
  .ext {
    margin-left: auto;
    padding: 0 4px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-faint);
    border: 1px solid var(--border);
    border-radius: 3px;
  }
  .file.pdf :global(svg) {
    color: var(--file-pdf);
  }
  .file.image :global(svg) {
    color: var(--file-image);
  }
  .file.video :global(svg) {
    color: var(--file-video);
  }
  .note.active {
    color: var(--text);
    background: var(--bg-active);
  }
  .note.active :global(svg) {
    color: var(--accent);
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
  .actions .icon {
    padding: 3px;
    color: var(--text-faint);
  }
  .actions .icon:hover {
    color: var(--text);
  }
</style>

<script lang="ts">
  import type { FolderAction, MoveKind, TreeNode } from "../types";
  import type { SearchHit } from "../search";
  import SearchResults from "./SearchResults.svelte";
  import Icon from "./Icon.svelte";
  import NoteTree from "./NoteTree.svelte";

  interface Props {
    vaultName: string;
    vaultPath: string;
    tree: TreeNode[];
    activePath: string | null;
    /** Search results while a query is active; null shows the folder tree. */
    results: SearchHit[] | null;
    onopenresult: (hit: SearchHit) => void;
    onselect: (path: string) => void;
    onopenfile: (path: string) => void;
    onnewnote: () => void;
    onfolderaction: (action: FolderAction, path: string) => void;
    /** Move a note, file or folder into `folder` ("" = vault root). */
    onmove: (path: string, kind: MoveKind, folder: string) => void;
    onclosevault: () => void;
  }
  let {
    vaultName,
    vaultPath,
    tree,
    activePath,
    results,
    onopenresult,
    onselect,
    onopenfile,
    onnewnote,
    onfolderaction,
    onmove,
    onclosevault,
  }: Props = $props();

  let expanded = $state<Record<string, boolean>>({});

  // ---- Drag to move (pointer events: HTML5 drag-and-drop is unreliable in Tauri webviews) ----

  interface DragItem {
    path: string;
    kind: MoveKind;
    name: string;
  }
  let nav = $state<HTMLElement>();
  let drag = $state<{ item: DragItem; x: number; y: number } | null>(null);
  /** Folder under the pointer that the item would move into; "" = root, null = nowhere. */
  let dropTarget = $state<string | null>(null);
  let suppressClick = false;
  let expandTimer: ReturnType<typeof setTimeout> | undefined;

  const parentOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf("/"), 0));

  function targetAt(x: number, y: number, item: DragItem): string | null {
    const el = document.elementFromPoint(x, y);
    if (!el || !nav?.contains(el)) return null;
    const row = el.closest<HTMLElement>("[data-drag-path]");
    // Dropping on a note or file means "into its folder".
    const folder = !row ? "" : row.dataset.dragKind === "folder" ? row.dataset.dragPath! : parentOf(row.dataset.dragPath!);
    const intoItself = item.kind === "folder" && (folder === item.path || folder.startsWith(`${item.path}/`));
    return intoItself || folder === parentOf(item.path) ? null : folder;
  }

  function setTarget(folder: string | null) {
    if (folder === dropTarget) return;
    dropTarget = folder;
    clearTimeout(expandTimer);
    // Hovering a folder for a moment opens it, so you can drop deeper.
    if (folder) expandTimer = setTimeout(() => (expanded[folder] = true), 600);
  }

  function onpointerdown(e: PointerEvent) {
    const el = e.target as HTMLElement;
    const row = el.closest<HTMLElement>("[data-drag-path]");
    if (e.button !== 0 || !row || el.closest(".actions")) return;
    const item: DragItem = {
      path: row.dataset.dragPath!,
      kind: row.dataset.dragKind as MoveKind,
      name: row.dataset.dragName!,
    };
    const startX = e.clientX;
    const startY = e.clientY;

    const move = (ev: PointerEvent) => {
      if (!drag && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
      drag = { item, x: ev.clientX, y: ev.clientY };
      setTarget(targetAt(ev.clientX, ev.clientY, item));
    };
    const end = (drop: boolean) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", onup);
      window.removeEventListener("keydown", onkey);
      clearTimeout(expandTimer);
      if (drag) {
        // The click that follows a drag must not open the item.
        suppressClick = true;
        setTimeout(() => (suppressClick = false));
        if (drop && dropTarget !== null) onmove(item.path, item.kind, dropTarget);
      }
      drag = null;
      dropTarget = null;
    };
    const onup = () => end(true);
    const onkey = (ev: KeyboardEvent) => ev.key === "Escape" && end(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", onup);
    window.addEventListener("keydown", onkey);
  }
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
  <nav
    bind:this={nav}
    class:dragging={drag !== null}
    class:drop-root={dropTarget === ""}
    {onpointerdown}
    onclickcapture={(e) => {
      if (suppressClick) {
        e.stopPropagation();
        e.preventDefault();
      }
    }}
  >
    {#if results}
      <SearchResults hits={results} onopen={onopenresult} />
    {:else if tree.length}
      <NoteTree
        nodes={tree}
        {activePath}
        {expanded}
        {dropTarget}
        {onselect}
        {onopenfile}
        ontoggle={(path, open) => (expanded[path] = open)}
        {onfolderaction}
      />
    {:else}
      <p class="empty">No notes yet</p>
    {/if}
  </nav>
</aside>

{#if drag}
  <div class="ghost" style:left="{drag.x + 12}px" style:top="{drag.y + 8}px">
    {drag.item.name}
    {#if dropTarget !== null}<span>→ {dropTarget || "vault root"}</span>{/if}
  </div>
{/if}

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
  nav.dragging {
    user-select: none;
    cursor: grabbing;
  }
  nav.drop-root {
    box-shadow: inset 0 0 0 1px var(--accent);
    border-radius: var(--radius);
  }
  .ghost {
    position: fixed;
    z-index: 10;
    pointer-events: none;
    max-width: 260px;
    padding: 3px 8px;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text);
    background: var(--bg-active);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 6px 16px rgb(0 0 0 / 0.35);
  }
  .ghost span {
    margin-left: 6px;
    color: var(--accent);
  }
  .empty {
    padding: 0 8px;
    color: var(--text-faint);
  }
</style>

<script lang="ts">
  import type { Vault } from "$lib/types";
  import { buildTree, backlinks, noteTitle, wordCount } from "$lib/notes";
  import { mockVault } from "$lib/mock/vault";
  import Toolbar from "$lib/components/Toolbar.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import Editor from "$lib/components/Editor.svelte";
  import BacklinksPanel from "$lib/components/BacklinksPanel.svelte";
  import StatusBar from "$lib/components/StatusBar.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";

  let vault = $state<Vault | null>(structuredClone(mockVault));
  let activePath = $state<string | null>(null);
  let query = $state("");
  let sidebarOpen = $state(true);
  let backlinksOpen = $state(true);
  let searchInput = $state<HTMLInputElement>();

  const activeIndex = $derived(vault?.notes.findIndex((n) => n.path === activePath) ?? -1);
  const activeNote = $derived(vault && activeIndex >= 0 ? vault.notes[activeIndex] : null);
  const tree = $derived.by(() => {
    if (!vault) return [];
    const q = query.trim().toLowerCase();
    return buildTree(q ? vault.notes.filter((n) => n.path.toLowerCase().includes(q)) : vault.notes);
  });
  const links = $derived(vault && activeNote ? backlinks(vault.notes, activeNote) : []);

  function openVault() {
    vault = structuredClone(mockVault);
  }

  function closeVault() {
    vault = null;
    activePath = null;
    query = "";
  }

  function newNote() {
    if (!vault) return;
    let n = 1;
    while (vault.notes.some((x) => x.path === `Untitled ${n}.md`)) n++;
    const path = `Untitled ${n}.md`;
    vault.notes.push({ path, content: "" });
    activePath = path;
    sidebarOpen = true;
  }

  function onkeydown(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === "\\") sidebarOpen = !sidebarOpen;
    else if (key === "b" && e.shiftKey) backlinksOpen = !backlinksOpen;
    else if (key === "n" && !e.shiftKey) newNote();
    else if (key === "k") searchInput?.focus();
    else return;
    e.preventDefault();
  }
</script>

<svelte:window {onkeydown} />

<div class="app">
  <Toolbar
    bind:query
    bind:searchInput
    {sidebarOpen}
    {backlinksOpen}
    disabled={!vault}
    ontogglesidebar={() => (sidebarOpen = !sidebarOpen)}
    ontogglebacklinks={() => (backlinksOpen = !backlinksOpen)}
    onnewnote={newNote}
  />

  <div class="body">
    {#if vault && sidebarOpen}
      <Sidebar
        vaultName={vault.name}
        {tree}
        {activePath}
        onselect={(p) => (activePath = p)}
        onclosevault={closeVault}
      />
    {/if}

    <main>
      {#if !vault}
        <EmptyState title="No vault open">
          <p>A vault is a folder of Markdown notes.</p>
          <button class="primary" onclick={openVault}>Open demo vault</button>
        </EmptyState>
      {:else if activeNote}
        {#key activePath}
          <Editor bind:note={vault.notes[activeIndex]} />
        {/key}
      {:else}
        <EmptyState title="No note selected">
          <p>Pick a note from the sidebar.</p>
          <p class="hints">
            <span><kbd>Ctrl</kbd> <kbd>N</kbd> new note</span>
            <span><kbd>Ctrl</kbd> <kbd>K</kbd> search</span>
            <span><kbd>Ctrl</kbd> <kbd>\</kbd> sidebar</span>
          </p>
        </EmptyState>
      {/if}
    </main>

    {#if vault && backlinksOpen && activeNote}
      <BacklinksPanel {links} onselect={(p) => (activePath = p)} />
    {/if}
  </div>

  <StatusBar
    noteCount={vault ? vault.notes.length : null}
    words={activeNote ? wordCount(activeNote.content) : null}
  />
</div>

<svelte:head>
  <title>{activeNote ? `${noteTitle(activeNote.path)} — Rook` : "Rook"}</title>
</svelte:head>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  .body {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow-y: auto;
  }
  .primary {
    background: var(--accent);
    color: #fff;
    padding: 6px 14px;
  }
  .hints {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 16px;
  }
  @media (max-width: 900px) {
    :global(:root) {
      --sidebar-w: 200px;
      --panel-w: 180px;
    }
  }
</style>

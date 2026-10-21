<script lang="ts">
  import type { Note, Vault } from "$lib/types";
  import { buildTree, backlinks, noteTitle, wordCount } from "$lib/notes";
  import * as api from "$lib/vault";
  import { errorMessage, isVaultError } from "$lib/vault";
  import Toolbar from "$lib/components/Toolbar.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import Editor from "$lib/components/Editor.svelte";
  import BacklinksPanel from "$lib/components/BacklinksPanel.svelte";
  import StatusBar from "$lib/components/StatusBar.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";

  let vault = $state<Vault | null>(null);
  let activePath = $state<string | null>(null);
  let query = $state("");
  let sidebarOpen = $state(true);
  let backlinksOpen = $state(true);
  let status = $state("");
  let searchInput = $state<HTMLInputElement>();
  let dialog: ConfirmDialog;

  const activeIndex = $derived(vault?.notes.findIndex((n) => n.path === activePath) ?? -1);
  const activeNote = $derived(vault && activeIndex >= 0 ? vault.notes[activeIndex] : null);
  const tree = $derived.by(() => {
    if (!vault) return [];
    const q = query.trim().toLowerCase();
    return buildTree(q ? vault.notes.filter((n) => n.path.toLowerCase().includes(q)) : vault.notes);
  });
  const links = $derived(vault && activeNote ? backlinks(vault.notes, activeNote) : []);

  const report = (err: unknown) => (status = errorMessage(err));

  // ---- Saving: debounced, serialized so each write sees the previous write's mtime ----

  let dirty = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let saving: Promise<void> = Promise.resolve();

  function onedit() {
    dirty = true;
    status = "Unsaved";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 500);
  }

  /** Saves pending edits of the active note; resolves once all writes have finished. */
  function flush(): Promise<void> {
    clearTimeout(saveTimer);
    if (dirty && activeNote) {
      const note = activeNote;
      dirty = false;
      saving = saving.then(() => save(note));
    }
    return saving;
  }

  async function save(note: Note) {
    try {
      const entry = await api.writeNote(note.path, note.content, note.modified);
      note.modified = entry.modified;
      status = "Saved";
    } catch (err) {
      if (isVaultError(err) && err.kind === "Conflict") await resolveConflict(note);
      else report(err);
    }
  }

  async function resolveConflict(note: Note) {
    const keepMine = await dialog.ask(
      `"${noteTitle(note.path)}" was changed outside Rook since you opened it.`,
      "Overwrite with my version",
      "Reload from disk",
    );
    try {
      if (keepMine) {
        note.modified = (await api.writeNote(note.path, note.content)).modified;
        status = "Saved";
      } else {
        const fresh = await api.readNote(note.path);
        note.content = fresh.content;
        note.modified = fresh.modified;
        status = "Reloaded from disk";
      }
    } catch (err) {
      report(err);
    }
  }

  // ---- Vault ----

  /** Syncs the note list with disk, re-reading only notes whose mtime changed. */
  async function refresh() {
    if (!vault) return;
    const entries = await api.listNotes();
    const known = new Map(vault.notes.map((n) => [n.path, n]));
    vault.notes = await Promise.all(
      entries.map(async (entry): Promise<Note> => {
        const prev = known.get(entry.path);
        if (prev && (prev.modified === entry.modified || (dirty && entry.path === activePath))) return prev;
        try {
          return await api.readNote(entry.path);
        } catch (err) {
          return { ...entry, content: "", error: errorMessage(err) };
        }
      }),
    );
    if (!dirty && activePath && !vault.notes.some((n) => n.path === activePath)) activePath = null;
  }

  async function openVault() {
    await flush();
    try {
      const info = await api.selectVault();
      if (!info) return;
      vault = { name: info.name, notes: [] };
      activePath = null;
      query = "";
      status = "Loading…";
      await refresh();
      status = "";
    } catch (err) {
      report(err);
    }
  }

  async function closeVault() {
    await flush();
    vault = null;
    activePath = null;
    query = "";
    status = "";
  }

  async function select(path: string) {
    await flush();
    activePath = path;
  }

  // ---- Note operations ----

  async function newNote() {
    if (!vault) return;
    await flush();
    for (let n = 1; n < 1000; n++) {
      const path = `Untitled ${n}.md`;
      if (vault.notes.some((x) => x.path.toLowerCase() === path.toLowerCase())) continue;
      try {
        const entry = await api.createNote(path);
        vault.notes.push({ ...entry, content: "" });
        activePath = entry.path;
        sidebarOpen = true;
        return;
      } catch (err) {
        if (isVaultError(err) && err.kind === "AlreadyExists") continue;
        return report(err);
      }
    }
  }

  async function renameActive(title: string): Promise<boolean> {
    const note = activeNote;
    if (!note) return false;
    await flush();
    const folder = note.path.slice(0, note.path.lastIndexOf("/") + 1);
    try {
      const from = note.path;
      const entry = await api.renameNote(from, `${folder}${title}.md`);
      note.path = entry.path;
      note.modified = entry.modified;
      // The user may have switched notes while the rename was in flight.
      if (activePath === from) activePath = entry.path;
      status = "Renamed";
      return true;
    } catch (err) {
      report(err);
      return false;
    }
  }

  async function deleteActive() {
    const note = activeNote;
    if (!vault || !note) return;
    if (!(await dialog.ask(`Delete "${noteTitle(note.path)}" permanently?`, "Delete"))) return;
    // Pending edits are discarded, not saved, since the note is going away.
    clearTimeout(saveTimer);
    dirty = false;
    await saving;
    try {
      await api.deleteNote(note.path);
      vault.notes = vault.notes.filter((n) => n.path !== note.path);
      activePath = null;
      status = "Deleted";
    } catch (err) {
      report(err);
    }
  }

  function onkeydown(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === "\\") sidebarOpen = !sidebarOpen;
    else if (key === "b" && e.shiftKey) backlinksOpen = !backlinksOpen;
    else if (key === "n" && !e.shiftKey) newNote();
    else if (key === "k") searchInput?.focus();
    else if (key === "s") flush();
    else return;
    e.preventDefault();
  }
</script>

<svelte:window {onkeydown} onfocus={() => refresh().catch(report)} />

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
        onselect={select}
        onclosevault={closeVault}
      />
    {/if}

    <main>
      {#if !vault}
        <EmptyState title="No vault open">
          <p>A vault is a folder of Markdown notes.</p>
          <button class="primary" onclick={openVault}>Open folder…</button>
        </EmptyState>
      {:else if activeNote}
        {#key activePath}
          <Editor
            bind:note={vault.notes[activeIndex]}
            {onedit}
            onrename={renameActive}
            ondelete={deleteActive}
          />
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
      <BacklinksPanel {links} onselect={select} />
    {/if}
  </div>

  <StatusBar
    noteCount={vault ? vault.notes.length : null}
    words={activeNote ? wordCount(activeNote.content) : null}
    {status}
  />
</div>

<ConfirmDialog bind:this={dialog} />

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

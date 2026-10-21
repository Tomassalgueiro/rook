<script lang="ts">
  import { onMount } from "svelte";
  import type { FolderAction, Note, Vault } from "$lib/types";
  import { buildTree, backlinks, noteTitle, wordCount } from "$lib/notes";
  import * as api from "$lib/vault";
  import { errorMessage, isVaultError, type RecentVault, type VaultInfo } from "$lib/vault";
  import Toolbar from "$lib/components/Toolbar.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import Editor from "$lib/components/Editor.svelte";
  import BacklinksPanel from "$lib/components/BacklinksPanel.svelte";
  import StatusBar from "$lib/components/StatusBar.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import Dialog from "$lib/components/Dialog.svelte";
  import VaultPicker from "$lib/components/VaultPicker.svelte";
  import Resizer from "$lib/components/Resizer.svelte";

  let vault = $state<Vault | null>(null);
  let activePath = $state<string | null>(null);
  let query = $state("");
  let sidebarOpen = $state(true);
  let backlinksOpen = $state(true);
  let status = $state("");
  let recent = $state<RecentVault[]>([]);

  // Panel widths are a per-machine convenience, so localStorage is enough.
  const storedWidth = (key: string, fallback: number) => {
    try {
      return Number(localStorage.getItem(key)) || fallback;
    } catch {
      return fallback;
    }
  };
  let sidebarWidth = $state(storedWidth("rook.sidebarWidth", 260));
  let panelWidth = $state(storedWidth("rook.panelWidth", 240));
  $effect(() => {
    try {
      localStorage.setItem("rook.sidebarWidth", String(sidebarWidth));
      localStorage.setItem("rook.panelWidth", String(panelWidth));
    } catch {
      // Storage unavailable; widths just won't persist.
    }
  });
  let searchInput = $state<HTMLInputElement>();
  let dialog: Dialog;

  const activeIndex = $derived(vault?.notes.findIndex((n) => n.path === activePath) ?? -1);
  const activeNote = $derived(vault && activeIndex >= 0 ? vault.notes[activeIndex] : null);
  const tree = $derived.by(() => {
    if (!vault) return [];
    const q = query.trim().toLowerCase();
    if (!q) return buildTree(vault.notes, vault.folders, vault.files);
    const match = (x: { path: string }) => x.path.toLowerCase().includes(q);
    return buildTree(vault.notes.filter(match), [], vault.files.filter(match));
  });
  const links = $derived(vault && activeNote ? backlinks(vault.notes, activeNote) : []);

  const report = (err: unknown) => (status = errorMessage(err));
  const inFolder = (path: string, folder: string) => path.startsWith(`${folder}/`);

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

  /** Syncs notes and folders with disk, re-reading only notes whose mtime changed. */
  async function refresh() {
    const v = vault;
    if (!v) return;
    const listing = await api.listVault();
    const known = new Map(v.notes.map((n) => [n.path, n]));
    v.folders = listing.folders;
    v.files = listing.files;
    v.notes = await Promise.all(
      listing.notes.map(async (entry): Promise<Note> => {
        const prev = known.get(entry.path);
        if (prev && (prev.modified === entry.modified || (dirty && entry.path === activePath))) return prev;
        try {
          return await api.readNote(entry.path);
        } catch (err) {
          return { ...entry, content: "", error: errorMessage(err) };
        }
      }),
    );
    if (!dirty && activePath && !v.notes.some((n) => n.path === activePath)) activePath = null;
  }

  /** Runs `open` (picker, recent, etc.) and loads the vault it returns; keeps the current one on cancel. */
  async function load(open: () => Promise<VaultInfo | null>) {
    await flush();
    try {
      const info = await open();
      if (!info) return;
      vault = { name: info.name, path: info.path, notes: [], files: [], folders: [] };
      activePath = null;
      query = "";
      status = "Loading…";
      await refresh();
      status = "";
    } catch (err) {
      report(err);
      loadRecent();
    }
  }

  const loadRecent = () =>
    api
      .recentVaults()
      .then((r) => (recent = r))
      .catch(report);

  const openVault = () => load(api.selectVault);
  const openRecent = (path: string) => load(() => api.openRecentVault(path));

  async function createVault() {
    const name = await dialog.prompt("Name of the new vault", "", "Choose location…");
    if (name) await load(() => api.createVault(name));
  }

  async function forgetRecent(path: string) {
    await api.forgetVault(path).catch(report);
    await loadRecent();
  }

  async function closeVault() {
    await flush();
    await api.closeVault().catch(report);
    vault = null;
    activePath = null;
    query = "";
    status = "";
    await loadRecent();
  }

  onMount(async () => {
    await load(api.reopenLastVault);
    if (!vault) await loadRecent();
  });

  async function select(path: string) {
    await flush();
    activePath = path;
  }

  // ---- Note operations ----

  async function newNote(folder = "") {
    if (!vault) return;
    await flush();
    for (let n = 1; n < 1000; n++) {
      const path = `${folder ? `${folder}/` : ""}Untitled ${n}.md`;
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

  // ---- Folder operations ----

  async function newFolder(parent: string) {
    const name = await dialog.prompt(parent ? `New folder in "${parent}"` : "New folder", "", "Create");
    if (!name) return;
    try {
      await api.createFolder(parent ? `${parent}/${name}` : name);
      await refresh();
      status = "Folder created";
    } catch (err) {
      report(err);
    }
  }

  async function renameFolder(path: string) {
    const to = await dialog.prompt("Rename or move folder (path inside the vault)", path, "Rename");
    if (!to || to === path || !vault) return;
    await flush();
    try {
      await api.renameFolder(path, to);
      // Remap locally so moved notes keep their loaded content (refresh skips unchanged mtimes).
      const move = (p: string) => (p === path || inFolder(p, path) ? to + p.slice(path.length) : p);
      for (const note of vault.notes) note.path = move(note.path);
      if (activePath) activePath = move(activePath);
      await refresh();
      status = "Folder renamed";
    } catch (err) {
      report(err);
    }
  }

  async function deleteFolder(path: string) {
    if (!vault) return;
    const count = vault.notes.filter((n) => inFolder(n.path, path)).length;
    const question = `Delete folder "${path}" permanently? This removes ${count} note${count === 1 ? "" : "s"} and any other files inside it.`;
    if (!(await dialog.ask(question, "Delete folder"))) return;
    const activeInside = activePath !== null && inFolder(activePath, path);
    if (activeInside) {
      clearTimeout(saveTimer);
      dirty = false;
    }
    await saving;
    try {
      await api.deleteFolder(path);
      if (activeInside) activePath = null;
      await refresh();
      status = "Folder deleted";
    } catch (err) {
      report(err);
    }
  }

  function folderAction(action: FolderAction, path: string) {
    if (action === "note") newNote(path);
    else if (action === "folder") newFolder(path);
    else if (action === "rename") renameFolder(path);
    else deleteFolder(path);
  }

  function onkeydown(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === "\\") sidebarOpen = !sidebarOpen;
    else if (key === "b" && e.shiftKey) backlinksOpen = !backlinksOpen;
    else if (key === "n" && !e.shiftKey) newNote();
    else if (key === "n" && e.shiftKey && vault) newFolder("");
    else if (key === "k") searchInput?.focus();
    else if (key === "s") flush();
    else if (key === "o") openVault();
    else return;
    e.preventDefault();
  }
</script>

<svelte:window {onkeydown} onfocus={() => refresh().catch(report)} />

<div class="app" style:--sidebar-w="{sidebarWidth}px" style:--panel-w="{panelWidth}px">
  <Toolbar
    bind:query
    bind:searchInput
    {sidebarOpen}
    {backlinksOpen}
    disabled={!vault}
    ontogglesidebar={() => (sidebarOpen = !sidebarOpen)}
    ontogglebacklinks={() => (backlinksOpen = !backlinksOpen)}
  />

  <div class="body">
    {#if vault && sidebarOpen}
      <Sidebar
        vaultName={vault.name}
        vaultPath={vault.path}
        {tree}
        {activePath}
        searching={query.trim() !== ""}
        onselect={select}
        onopenfile={(path) => api.openFile(path).catch(report)}
        onnewnote={() => newNote()}
        onfolderaction={folderAction}
        onclosevault={closeVault}
      />
      <Resizer bind:width={sidebarWidth} direction={1} label="Resize sidebar" />
    {/if}

    <main>
      {#if !vault}
        <VaultPicker
          {recent}
          onopen={openVault}
          oncreate={createVault}
          onopenrecent={openRecent}
          onforget={forgetRecent}
        />
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
            <span><kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>N</kbd> new folder</span>
            <span><kbd>Ctrl</kbd> <kbd>K</kbd> search</span>
            <span><kbd>Ctrl</kbd> <kbd>\</kbd> sidebar</span>
          </p>
        </EmptyState>
      {/if}
    </main>

    {#if vault && backlinksOpen && activeNote}
      <Resizer bind:width={panelWidth} direction={-1} label="Resize backlinks panel" />
      <BacklinksPanel {links} onselect={select} />
    {/if}
  </div>

  <StatusBar
    noteCount={vault ? vault.notes.length : null}
    words={activeNote ? wordCount(activeNote.content) : null}
    {status}
  />
</div>

<Dialog bind:this={dialog} />

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
  .hints {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 16px;
  }
</style>

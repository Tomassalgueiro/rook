<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { FolderAction, MoveKind, Note, Vault } from "$lib/types";
  import {
    buildTree,
    backlinks,
    noteTitle,
    parseWikilink,
    resolveRelative,
    resolveWikilink,
    wordCount,
  } from "$lib/notes";
  import * as api from "$lib/vault";
  import { errorMessage, isVaultError, type RecentVault, type VaultInfo } from "$lib/vault";
  import Toolbar from "$lib/components/Toolbar.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import Editor from "$lib/components/Editor.svelte";
  import BacklinksPanel from "$lib/components/BacklinksPanel.svelte";
  import StatusBar from "$lib/components/StatusBar.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import Dialog from "$lib/components/Dialog.svelte";
  import type { LinkOption, LinkProvider, LinkTarget } from "$lib/editor/setup";
  import { headingsIn } from "$lib/editor/livePreview";
  import { updateLinksIn } from "$lib/linkUpdate";
  import { search, type SearchHit } from "$lib/search";
  import { cssVars, loadSettings, saveSettings } from "$lib/settings";
  import Settings from "$lib/components/Settings.svelte";
  import VaultPicker from "$lib/components/VaultPicker.svelte";
  import Resizer from "$lib/components/Resizer.svelte";

  let vault = $state<Vault | null>(null);
  let activePath = $state<string | null>(null);
  let query = $state("");
  let sidebarOpen = $state(true);
  let backlinksOpen = $state(true);
  let status = $state("");
  let vimMode = $state<string | null>(null);
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
  let editor = $state<Editor>();
  let settingsDialog: Settings;

  let settings = $state(loadSettings());
  $effect(() => {
    saveSettings(settings);
    for (const [name, value] of Object.entries(cssVars(settings))) {
      document.documentElement.style.setProperty(name, value);
    }
  });
  const editorOptions = $derived({ showSyntax: settings.syntax === "always", spellcheck: settings.spellcheck });

  const activeIndex = $derived(vault?.notes.findIndex((n) => n.path === activePath) ?? -1);
  const activeNote = $derived(vault && activeIndex >= 0 ? vault.notes[activeIndex] : null);
  const tree = $derived(vault ? buildTree(vault.notes, vault.folders, vault.files) : []);
  /** Full-text results while searching; null shows the folder tree. */
  const results = $derived(vault && query.trim() ? search(vault.notes, vault.files, query) : null);

  // Results show in the sidebar, so open it when a search starts.
  $effect(() => {
    if (query.trim()) sidebarOpen = true;
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

  // ---- Links ----

  /** [[ autocomplete entries: note titles (full path when titles clash) and files. */
  function linkOptions(): LinkOption[] {
    if (!vault) return [];
    const folderOf = (p: string) => p.slice(0, Math.max(p.lastIndexOf("/"), 0)) || undefined;
    const titleCount = new Map<string, number>();
    for (const n of vault.notes) {
      const t = noteTitle(n.path).toLowerCase();
      titleCount.set(t, (titleCount.get(t) ?? 0) + 1);
    }
    const notes = vault.notes
      .filter((n) => n.path !== activePath)
      .map((n) => ({
        label: titleCount.get(noteTitle(n.path).toLowerCase())! > 1 ? n.path.replace(/\.md$/i, "") : noteTitle(n.path),
        detail: folderOf(n.path),
      }));
    const files = vault.files.map((f) => ({ label: f.path.slice(f.path.lastIndexOf("/") + 1), detail: folderOf(f.path) }));
    return [...notes, ...files];
  }

  const linkProvider: LinkProvider = {
    targets: linkOptions,
    headings: (name) => {
      const note = name ? resolveWikilink(vault?.notes ?? [], name) : activeNote;
      return note ? headingsIn(note.content) : [];
    },
    exists: (target) => {
      const { name } = parseWikilink(target);
      return !name || !!resolveWikilink(vault?.notes ?? [], name) || !!resolveWikilink(vault?.files ?? [], name);
    },
  };

  /** Changes when notes or files are added, removed or renamed (not on content edits). */
  const linkKey = $derived(vault ? [...vault.notes, ...vault.files].map((x) => x.path).join("\n") : "");

  /** Opens a note, optionally scrolled to a heading. */
  async function openAt(path: string, heading?: string) {
    if (path !== activePath) await select(path);
    if (!heading) return;
    await tick(); // let the editor for the newly opened note mount
    if (!editor?.scrollToHeading(heading)) status = `Heading not found: ${heading}`;
  }

  /** Opens a search result; for a text match, selects it in the note. */
  async function openResult(hit: SearchHit | undefined) {
    if (!hit) return;
    if (hit.kind !== "note") return api.openFile(hit.path).catch(report);
    if (hit.path !== activePath) await select(hit.path);
    if (!hit.match) return;
    await tick(); // let the editor for the newly opened note mount
    editor?.selectRange(hit.match.from, hit.match.to);
  }

  async function openLink(link: LinkTarget) {
    if (!vault) return;
    if (link.kind === "wiki") {
      const { name, heading } = parseWikilink(link.target);
      // [[#Heading]] points into the current note.
      if (!name) return activePath && heading ? openAt(activePath, heading) : undefined;
      const note = resolveWikilink(vault.notes, name);
      if (note) return openAt(note.path, heading);
      const file = resolveWikilink(vault.files, name);
      if (file) return api.openFile(file.path).catch(report);
      // Like Obsidian, following a link to a missing note creates it.
      await flush();
      try {
        const entry = await api.createNote(`${name}.md`);
        vault.notes.push({ ...entry, content: "" });
        activePath = entry.path;
        status = `Created ${entry.path}`;
      } catch (err) {
        report(err);
      }
      return;
    }

    const href = link.href.trim();
    if (/^(https?:|mailto:)/i.test(href)) return api.openUrl(href).catch(report);
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return void (status = `Can't open ${href}`);
    // Relative link to a note or file (resolved from the current note's folder), maybe with #heading.
    const decode = (part: string) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part; // Not URI-encoded; use as-is.
      }
    };
    const hash = href.indexOf("#");
    const target = decode(hash < 0 ? href : href.slice(0, hash));
    const heading = hash < 0 ? undefined : decode(href.slice(hash + 1)) || undefined;
    if (!target) return activePath && heading ? openAt(activePath, heading) : undefined;
    const folder = activePath?.slice(0, Math.max(activePath.lastIndexOf("/"), 0)) ?? "";
    const path = resolveRelative(folder, target);
    const note = path && vault.notes.find((n) => n.path === path || n.path === `${path}.md`);
    if (note) return openAt(note.path, heading);
    const file = path && vault.files.find((f) => f.path === path);
    if (file) return api.openFile(file.path).catch(report);
    status = `Link target not found: ${href}`;
  }

  // ---- Moving (every move also rewrites links; see $lib/linkUpdate) ----

  /** Vault paths before a move, for resolving links as they were written. */
  const snapshot = (v: Vault) => ({ notesBefore: v.notes.map((n) => n.path), filesBefore: v.files.map((f) => f.path) });

  const withLinks = (message: string, updated: number) =>
    updated ? `${message} · updated links in ${updated} note${updated === 1 ? "" : "s"}` : message;

  /**
   * After notes/files moved (`moved`: old -> new path; note objects already carry new paths),
   * rewrites links that pointed at them and relative links inside moved notes.
   * Returns how many notes changed.
   */
  async function updateLinks(moved: Map<string, string>, before: ReturnType<typeof snapshot>): Promise<number> {
    if (!vault || !settings.updateLinks) return 0;
    const oldPathOf = new Map([...moved].map(([from, to]) => [to, from]));
    let updated = 0;
    for (const note of vault.notes) {
      if (note.error) continue;
      const original = note.content;
      const text = updateLinksIn(original, oldPathOf.get(note.path) ?? note.path, note.path, { moved, ...before });
      if (text === original) continue;
      try {
        const entry = await api.writeNote(note.path, text, note.modified);
        note.modified = entry.modified;
        // If the user typed meanwhile, keep their text; their next save wins for this note.
        if (note.content === original) note.content = text;
        updated++;
      } catch (err) {
        report(err);
      }
    }
    return updated;
  }

  /** Renames or moves a note; returns how many notes had links updated, or null if it failed. */
  async function moveNote(from: string, to: string): Promise<number | null> {
    const note = vault?.notes.find((n) => n.path === from);
    if (!vault || !note) return null;
    await flush();
    const before = snapshot(vault);
    try {
      const entry = await api.renameNote(from, to);
      note.path = entry.path;
      note.modified = entry.modified;
      // The user may have switched notes while the rename was in flight.
      if (activePath === from) activePath = entry.path;
      return await updateLinks(new Map([[from, entry.path]]), before);
    } catch (err) {
      report(err);
      return null;
    }
  }

  /** Moves a PDF, image or video; same return value as `moveNote`. */
  async function moveFile(from: string, to: string): Promise<number | null> {
    if (!vault) return null;
    await flush();
    const before = snapshot(vault);
    try {
      await api.moveFile(from, to);
      const updated = await updateLinks(new Map([[from, to]]), before);
      await refresh();
      return updated;
    } catch (err) {
      report(err);
      return null;
    }
  }

  async function renameActive(title: string): Promise<boolean> {
    if (!activeNote) return false;
    const folder = activeNote.path.slice(0, activeNote.path.lastIndexOf("/") + 1);
    const updated = await moveNote(activeNote.path, `${folder}${title}.md`);
    if (updated === null) return false;
    status = withLinks("Renamed", updated);
    return true;
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

  /** Renames or moves a folder; same return value as `moveNote`. */
  async function moveFolder(path: string, to: string): Promise<number | null> {
    if (!vault) return null;
    await flush();
    const before = snapshot(vault);
    try {
      await api.renameFolder(path, to);
      // Remap locally so moved notes keep their loaded content (refresh skips unchanged mtimes).
      const move = (p: string) => (p === path || inFolder(p, path) ? to + p.slice(path.length) : p);
      const moved = new Map(
        [...before.notesBefore, ...before.filesBefore].filter((p) => inFolder(p, path)).map((p) => [p, move(p)]),
      );
      for (const note of vault.notes) note.path = move(note.path);
      if (activePath) activePath = move(activePath);
      const updated = await updateLinks(moved, before);
      await refresh();
      return updated;
    } catch (err) {
      report(err);
      return null;
    }
  }

  async function renameFolder(path: string) {
    const to = await dialog.prompt("Rename or move folder (path inside the vault)", path, "Rename");
    if (!to || to === path) return;
    const updated = await moveFolder(path, to);
    if (updated !== null) status = withLinks("Folder renamed", updated);
  }

  /** Sidebar drag-and-drop: moves a note, file or folder into `folder` ("" = vault root). */
  async function moveInto(path: string, kind: MoveKind, folder: string) {
    const name = path.slice(path.lastIndexOf("/") + 1);
    const to = folder ? `${folder}/${name}` : name;
    if (to === path) return;
    const move = kind === "note" ? moveNote : kind === "folder" ? moveFolder : moveFile;
    const updated = await move(path, to);
    if (updated !== null) status = withLinks(`Moved to ${folder || "vault root"}`, updated);
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
    // Keys the editor already handled (e.g. Vim's Ctrl+O jump-back) don't trigger Rook shortcuts.
    if (e.defaultPrevented || !(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === "\\") sidebarOpen = !sidebarOpen;
    else if (key === "b" && e.shiftKey) backlinksOpen = !backlinksOpen;
    else if (key === "n" && !e.shiftKey) newNote();
    else if (key === "n" && e.shiftKey && vault) newFolder("");
    else if (key === "k") searchInput?.focus();
    else if (key === "s") flush();
    else if (key === "o") openVault();
    else if (key === ",") settingsDialog.open();
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
    onsearchsubmit={() => openResult(results?.[0])}
    onopensettings={() => settingsDialog.open()}
  />

  <div class="body">
    {#if vault && sidebarOpen}
      <Sidebar
        vaultName={vault.name}
        vaultPath={vault.path}
        {tree}
        {activePath}
        {results}
        onopenresult={openResult}
        onselect={select}
        onopenfile={(path) => api.openFile(path).catch(report)}
        onnewnote={() => newNote()}
        onfolderaction={folderAction}
        onmove={moveInto}
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
            bind:this={editor}
            bind:note={vault.notes[activeIndex]}
            {onedit}
            onlink={openLink}
            links={linkProvider}
            {linkKey}
            options={editorOptions}
            vim={settings.vim}
            onvimmode={(mode) => (vimMode = mode)}
            onsave={() => flush().then(() => status.startsWith("Saved") || (status = "Saved"))}
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
    mode={vimMode}
  />
</div>

<Dialog bind:this={dialog} />
<Settings bind:this={settingsDialog} bind:settings />

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

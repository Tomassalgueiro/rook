# Rook — Phase 2: Vault API Proposal

Status: **approved and implemented** (backend only; frontend wiring pending).

## Summary

Seven Tauri commands on a single in-memory vault root. Every path that crosses IPC is a
**vault-relative, forward-slash string** (`"projects/Rook Roadmap.md"`); the Rust side never
accepts or returns absolute paths. Core logic is plain synchronous `std::fs` code (easy to unit
test), run off the main thread via `tauri::async_runtime::spawn_blocking`.

New dependencies:
- `tauri-plugin-dialog` (Rust only, used from Rust — the webview gets no dialog permission)
- `tempfile` (dev-dependency, tests only)

No JS dependencies, no database, no watcher.

## TypeScript types

```ts
// src/lib/vault.ts
export interface VaultInfo {
  name: string;          // folder name of the vault root
}

export interface NoteEntry {
  path: string;          // vault-relative, "/" separators, always ends in .md
  modified: number;      // ms since Unix epoch
}

export interface NoteContent extends NoteEntry {
  content: string;
}

export type VaultErrorKind =
  | "NoVault"            // no vault selected yet
  | "InvalidPath"        // malformed name: "..", absolute, reserved chars, not .md, hidden…
  | "OutsideVault"       // resolves (e.g. via symlink) outside the vault root
  | "NotFound"
  | "AlreadyExists"
  | "Conflict"           // file changed on disk since it was read (see write_note)
  | "PermissionDenied"
  | "InvalidEncoding"    // file is not valid UTF-8
  | "Io";                // anything else

export interface VaultError {
  kind: VaultErrorKind;
  message: string;       // human-readable, safe to show in the UI
}
```

`invoke` rejects with a `VaultError` object on failure.

## Rust command signatures

```rust
// src-tauri/src/vault.rs
pub struct VaultState(Mutex<Option<PathBuf>>); // canonicalized root

#[tauri::command]
async fn select_vault(app: AppHandle, state: State<'_, VaultState>)
    -> Result<Option<VaultInfo>, VaultError>;   // None = user cancelled dialog

#[tauri::command]
async fn list_notes(state: State<'_, VaultState>) -> Result<Vec<NoteEntry>, VaultError>;

#[tauri::command]
async fn read_note(state: State<'_, VaultState>, path: String) -> Result<NoteContent, VaultError>;

#[tauri::command]
async fn create_note(state: State<'_, VaultState>, path: String, content: Option<String>)
    -> Result<NoteEntry, VaultError>;

#[tauri::command]
async fn write_note(state: State<'_, VaultState>, path: String, content: String,
                    expected_modified: Option<u64>) -> Result<NoteEntry, VaultError>;

#[tauri::command]
async fn rename_note(state: State<'_, VaultState>, from: String, to: String)
    -> Result<NoteEntry, VaultError>;

#[tauri::command]
async fn delete_note(state: State<'_, VaultState>, path: String) -> Result<(), VaultError>;
```

`VaultError` is `#[derive(Serialize)]` with `kind` + `message`, and has `From<io::Error>`
mapping `NotFound`, `AlreadyExists`, `PermissionDenied`, `InvalidData` → matching kinds.

Code layout: `src-tauri/src/vault.rs` (state, errors, commands, fs ops) and
`src-tauri/src/paths.rs` (pure path validation + resolution). The starter `greet` command is removed.

## Command behaviour

| Command | Behaviour |
|---|---|
| `select_vault` | Opens a native folder picker **from Rust**, canonicalizes the result, stores it. The webview can't set an arbitrary root. |
| `list_notes` | Recursive walk. Only `*.md` files. Skips hidden entries (`.git`, `.obsidian`, temp files) and does **not** follow symlinks. Sorted by path. |
| `read_note` | Reads UTF-8 content + mtime. |
| `create_note` | Creates missing parent folders, then opens with `create_new(true)` — atomic, never overwrites. Existing file → `AlreadyExists`. |
| `write_note` | File must already exist (`NotFound` otherwise; no silent creation). If `expected_modified` is given and differs from disk → `Conflict`. Writes to a hidden temp file in the same folder, then renames over the target (no half-written notes on crash). |
| `rename_note` | Target exists → `AlreadyExists`. Case-only renames (`a.md` → `A.md`) allowed on case-insensitive filesystems. Creates missing target folders. |
| `delete_note` | Permanently removes the file (see open question 1). Does not remove folders. |

## Security & error-handling decisions

**Path validation (`paths.rs`, pure function, runs before any I/O).** Always reject:
- empty paths, absolute paths (`/x`, `\x`, `C:…`, `\\server\…`), backslashes
- `.` / `..` / empty components (`a//b`)
- NUL and control characters, and `< > : " | ? *`
- hidden components (leading `.`)
- names not ending in `.md` (case-insensitive)
- `:` on Windows (drive prefixes, alternate data streams)

Names Rook *creates* (`create_note`, the `to` side of `rename_note`) are also checked
**strictly**, on every platform, so a vault stays portable: no `< > : " | ? *`, no trailing
space or dot, no Windows reserved names (`CON`, `NUL`, `COM1`…). Existing files only get the
lenient rules, so a `Meeting: notes.md` made in vim on Linux still opens.

**Containment (after validation).**
- Existing targets: `canonicalize(root.join(path))` must `starts_with` the canonical root.
  This resolves symlinks, `..`, Windows junctions and 8.3 short names.
- New targets: canonicalize the deepest existing ancestor and check the same; the final
  component must not already exist as a symlink.
- Root and target are both canonicalized the same way, so Windows `\\?\` prefixes compare
  correctly.
- Symlinks *inside* the vault that point to files *inside* the vault are allowed; anything
  resolving outside → `OutsideVault`.

**Accepted risk.** There is a check-then-use window (TOCTOU) between the containment check and
the file operation. A local attacker who can swap symlinks in your vault already has your user
account, so this isn't defended against. `rename_note`'s existence check has the same race; the
OS has no portable no-replace rename.

**Async.** Each command does `spawn_blocking(move || sync_impl(...))`, so slow disks never block
the UI thread. No tokio dependency is added; Tauri re-exports its runtime.

**Errors.** Never panic on user input. Messages contain the vault-relative path, never the
absolute one.

## Minimal test plan

Rust unit tests (`cargo test` in `src-tauri`), using `tempfile::TempDir` vaults:
1. `validate`: table test of accepted and rejected paths (all the cases above).
2. `resolve`: `../x.md` rejected; a symlink to `/etc` → `OutsideVault` (`#[cfg(unix)]`); an
   in-vault symlink is accepted.
3. `create_note` twice → second is `AlreadyExists`; nested folders are created.
4. `write_note` on a missing file → `NotFound`; stale `expected_modified` → `Conflict`; no
   temp file left behind.
5. `rename_note` onto an existing note → `AlreadyExists`, and the source is untouched.
6. `list_notes` skips hidden directories, non-`.md` files and symlinked directories.
7. Read-only file → `PermissionDenied` (`#[cfg(unix)]`).

Manual: pick a vault, then create, edit, rename and delete a note in `pnpm tauri dev`. On
Windows, check that a junction pointing outside the vault is rejected.

## Integration guide (frontend agent)

1. Add `src/lib/vault.ts`: the types above plus thin typed wrappers, e.g.
   `export const readNote = (path: string) => invoke<NoteContent>("read_note", { path });`.
   Tauri maps snake_case args to camelCase in JS (`expectedModified`).
2. Replace `mockVault` in `+page.svelte` with `selectVault()` + `listNotes()`. `buildTree`
   already works on vault-relative paths, so the tree needs no changes.
3. Load content lazily with `readNote` when a note is opened. Keep `modified` and pass it as
   `expectedModified` on save. On `Conflict`, ask the user whether to reload or overwrite.
4. Save on debounce (~500 ms) and on note switch, not on every keystroke.
5. Ctrl+N → `createNote("Untitled N.md")`. On `AlreadyExists`, bump N and retry.
6. Show `error.message` in the status bar; branch on `error.kind`, never on the message text.
7. Backlinks currently need every note's content. For v1, read all notes after opening the
   vault (fine for small vaults); later this becomes a Rust `backlinks` command.
8. `delete_note` is permanent, so confirm in the UI first.

## Decisions (reviewed)

1. Delete is permanent; the UI must confirm first.
2. Conflict detection via `expected_modified` is kept (e.g. a note edited in vim while open).
3. Reopening the last vault on startup is deferred to a later phase.
4. Folder operations are the next step after v1.

## Addendum: folder operations (implemented)

- `list_notes` is replaced by `list_vault() -> { notes: NoteEntry[], folders: string[] }`, so
  empty folders are listed too. Hidden and symlinked folders are still skipped.
- `create_folder(path)`: creates missing parent folders; fails with `AlreadyExists` if the folder exists.
- `rename_folder(from, to)`: the same rules as `rename_note` (never overwrites, allows
  case-only renames). Moving a folder into itself → `InvalidPath`.
- `delete_folder(path)`: **permanently and recursively** deletes the folder, including non-note
  files. Never follows a symlink. The UI confirms first and shows the note count.
- Folder paths get the same validation as notes, minus the `.md` requirement. Passing a note
  to a folder command (or the reverse) → `NotFound` ("not a folder" / "not a note").

## Addendum: vault management (implemented)

The recent-vaults list is stored in `<app config dir>/vaults.json` as `{ vaults: [...], last_open }`,
newest first, at most 10. A missing or corrupt file just means the list is empty.

- `select_vault()`: opens the folder picker and adds the vault to the recent list.
  `VaultInfo` now includes `path` (absolute, for display only).
- `create_vault(name)`: `name` must be a single strict folder name. Opens the picker to
  choose the parent folder, creates the folder (never reuses an existing one) and opens it.
- `open_recent_vault(path)`: only accepts paths already in the recent list, so the webview
  still can't open an arbitrary folder.
- `reopen_last_vault()`: called on launch; returns null if nothing was open or the folder is gone.
- `recent_vaults() -> { name, path, exists }[]`, `forget_vault(path)`.
- `close_vault()`: closes the vault on the Rust side and clears `last_open`, so a vault closed
  before quitting isn't reopened on the next launch.

## Addendum: non-note files (implemented)

- `list_vault` also returns `files: { path, kind }[]` for supported non-note files. `kind` is
  `"pdf"`, `"image"` (png, jpg, jpeg, gif, webp, svg, bmp, avif) or `"video"` (mp4, webm, mov,
  mkv, m4v, ogv). Other file types are still not listed.
- `open_file(path)`: opens the file with the OS default app, from Rust (no opener permission is
  given to the webview). Only supported extensions are accepted, so it can't launch executables.
  The usual vault containment checks apply.
- `open_url(url)`: opens `http://`, `https://` and `mailto:` links with the OS default app;
  any other scheme → `InvalidPath`. Used for clicked links in notes.

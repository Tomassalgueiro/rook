//! Vault commands: a single selected root folder of Markdown notes.
//! All paths crossing IPC are vault-relative with '/' separators (see `paths`).

use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::paths::{file_type, resolve_existing, resolve_new, validate, Kind};
use crate::vaults::Recents;

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub enum ErrorKind {
    NoVault,
    InvalidPath,
    OutsideVault,
    NotFound,
    AlreadyExists,
    Conflict,
    PermissionDenied,
    InvalidEncoding,
    Io,
}

#[derive(Debug, Serialize)]
pub struct VaultError {
    pub kind: ErrorKind,
    pub message: String,
}

impl VaultError {
    pub fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self { kind, message: message.into() }
    }

    /// Maps an I/O error on `rel`; messages never contain absolute paths.
    pub fn from_io(err: io::Error, rel: &str) -> Self {
        let (kind, what) = match err.kind() {
            io::ErrorKind::NotFound => (ErrorKind::NotFound, "not found".into()),
            io::ErrorKind::AlreadyExists => (ErrorKind::AlreadyExists, "already exists".into()),
            io::ErrorKind::PermissionDenied => (ErrorKind::PermissionDenied, "permission denied".into()),
            io::ErrorKind::InvalidData => (ErrorKind::InvalidEncoding, "is not valid UTF-8".into()),
            _ => (ErrorKind::Io, err.to_string()),
        };
        Self::new(kind, format!("{rel}: {what}"))
    }
}

#[derive(Serialize)]
pub struct VaultInfo {
    name: String,
    /// Absolute root, for display only.
    path: String,
}

#[derive(Serialize)]
pub struct RecentVault {
    name: String,
    path: String,
    exists: bool,
}

#[derive(Debug, Serialize)]
pub struct NoteEntry {
    path: String,
    modified: u64,
}

/// A PDF, image or video in the vault.
#[derive(Debug, Serialize)]
pub struct FileEntry {
    path: String,
    /// "pdf", "image" or "video".
    kind: &'static str,
}

/// Folders are listed separately so empty ones still show up.
#[derive(Debug, Serialize)]
pub struct VaultListing {
    notes: Vec<NoteEntry>,
    files: Vec<FileEntry>,
    folders: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct NoteContent {
    path: String,
    modified: u64,
    content: String,
}

/// Canonicalized root of the open vault.
#[derive(Default)]
pub struct VaultState(Mutex<Option<PathBuf>>);

impl VaultState {
    fn root(&self) -> Result<PathBuf, VaultError> {
        let root = self.0.lock().unwrap_or_else(|e| e.into_inner());
        root.clone().ok_or_else(|| VaultError::new(ErrorKind::NoVault, "No vault is open"))
    }
}

fn modified_ms(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_millis() as u64)
}

fn entry(path: &Path, rel: &str) -> Result<NoteEntry, VaultError> {
    let meta = fs::metadata(path).map_err(|e| VaultError::from_io(e, rel))?;
    Ok(NoteEntry { path: rel.to_string(), modified: modified_ms(&meta) })
}

fn wrong_kind(rel: &str, kind: Kind) -> VaultError {
    let what = match kind {
        Kind::Note => "note",
        Kind::Folder => "folder",
        Kind::File => "supported file",
    };
    VaultError::new(ErrorKind::NotFound, format!("{rel}: not a {what}"))
}

// ---- Filesystem operations (sync, unit-tested) ----

fn list(root: &Path) -> Result<VaultListing, VaultError> {
    fn walk(dir: &Path, prefix: &str, out: &mut VaultListing) -> io::Result<()> {
        for item in fs::read_dir(dir)? {
            let item = item?;
            let Some(name) = item.file_name().to_str().map(str::to_owned) else { continue };
            if name.starts_with('.') {
                continue;
            }
            let rel = format!("{prefix}{name}");
            // file_type() does not follow symlinks, so symlinks are skipped entirely.
            let entry_type = item.file_type()?;
            if entry_type.is_dir() {
                // An unreadable subfolder shouldn't hide the rest of the vault.
                let _ = walk(&item.path(), &format!("{rel}/"), out);
                out.folders.push(rel);
            } else if entry_type.is_file() && name.to_ascii_lowercase().ends_with(".md") {
                let modified = item.metadata().map_or(0, |m| modified_ms(&m));
                out.notes.push(NoteEntry { path: rel, modified });
            } else if let Some(kind) = file_type(&name).filter(|_| entry_type.is_file()) {
                out.files.push(FileEntry { path: rel, kind });
            }
        }
        Ok(())
    }

    let mut listing = VaultListing { notes: Vec::new(), files: Vec::new(), folders: Vec::new() };
    walk(root, "", &mut listing).map_err(|e| VaultError::from_io(e, "vault"))?;
    listing.notes.sort_by(|a, b| a.path.cmp(&b.path));
    listing.files.sort_by(|a, b| a.path.cmp(&b.path));
    listing.folders.sort();
    Ok(listing)
}

fn read(root: &Path, rel: &str) -> Result<NoteContent, VaultError> {
    let (path, _) = resolve_existing(root, rel, Kind::Note)?;
    let io = |e| VaultError::from_io(e, rel);
    let meta = fs::metadata(&path).map_err(io)?;
    if !meta.is_file() {
        return Err(wrong_kind(rel, Kind::Note));
    }
    let content = fs::read_to_string(&path).map_err(io)?;
    Ok(NoteContent { path: rel.to_string(), modified: modified_ms(&meta), content })
}

fn create(root: &Path, rel: &str, content: &str) -> Result<NoteEntry, VaultError> {
    let path = resolve_new(root, rel, Kind::Note)?;
    let io = |e| VaultError::from_io(e, rel);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(io)?;
    }
    // create_new is atomic: fails instead of overwriting if the file appeared meanwhile.
    let mut file = OpenOptions::new().write(true).create_new(true).open(&path).map_err(io)?;
    file.write_all(content.as_bytes()).map_err(io)?;
    entry(&path, rel)
}

fn write(root: &Path, rel: &str, content: &str, expected_modified: Option<u64>) -> Result<NoteEntry, VaultError> {
    // Write through symlinks to the real file so the link itself is preserved.
    let (_, real) = resolve_existing(root, rel, Kind::Note)?;
    let io = |e| VaultError::from_io(e, rel);
    let meta = fs::metadata(&real).map_err(io)?;
    if !meta.is_file() {
        return Err(wrong_kind(rel, Kind::Note));
    }
    if expected_modified.is_some_and(|m| m != modified_ms(&meta)) {
        return Err(VaultError::new(
            ErrorKind::Conflict,
            format!("{rel} was changed outside Rook since it was opened"),
        ));
    }

    // Atomic replace: write a hidden temp file next to the note, then rename over it.
    let file_name = real.file_name().unwrap_or_default().to_string_lossy();
    let tmp = real.with_file_name(format!(".{file_name}.rook-tmp"));
    let result = (|| {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(content.as_bytes())?;
        file.sync_all()?;
        fs::set_permissions(&tmp, meta.permissions())?;
        fs::rename(&tmp, &real)
    })();
    if let Err(e) = result {
        let _ = fs::remove_file(&tmp);
        return Err(io(e));
    }
    entry(&real, rel)
}

/// Moves a note or folder; never overwrites. Returns the destination path.
fn move_entry(root: &Path, from: &str, to: &str, kind: Kind) -> Result<PathBuf, VaultError> {
    let (src, src_real) = resolve_existing(root, from, kind)?;
    if fs::symlink_metadata(&src).map_err(|e| VaultError::from_io(e, from))?.is_dir() != (kind == Kind::Folder) {
        return Err(wrong_kind(from, kind));
    }
    if kind == Kind::Folder && to.starts_with(&format!("{from}/")) {
        return Err(VaultError::new(ErrorKind::InvalidPath, format!("Can't move {from} into itself")));
    }
    let dst = match resolve_new(root, to, kind) {
        Ok(dst) => dst,
        // Case-only rename on a case-insensitive filesystem: the "existing" target is the source.
        Err(e) if e.kind == ErrorKind::AlreadyExists
            && fs::canonicalize(root.join(to)).is_ok_and(|p| p == src_real)
            && from != to =>
        {
            root.join(to)
        }
        Err(e) => return Err(e),
    };
    let io = |e| VaultError::from_io(e, to);
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(io)?;
    }
    fs::rename(&src, &dst).map_err(io)?;
    Ok(dst)
}

fn delete(root: &Path, rel: &str, kind: Kind) -> Result<(), VaultError> {
    let (path, _) = resolve_existing(root, rel, kind)?;
    let io = |e| VaultError::from_io(e, rel);
    // symlink_metadata: a symlinked folder is never followed (list_vault doesn't show them).
    let meta = fs::symlink_metadata(&path).map_err(io)?;
    match kind {
        Kind::Note if !meta.is_dir() => fs::remove_file(&path).map_err(io),
        // Permanently removes everything inside, including non-note files.
        Kind::Folder if meta.is_dir() => fs::remove_dir_all(&path).map_err(io),
        _ => Err(wrong_kind(rel, kind)),
    }
}

fn create_folder_at(root: &Path, rel: &str) -> Result<(), VaultError> {
    let path = resolve_new(root, rel, Kind::Folder)?;
    let io = |e| VaultError::from_io(e, rel);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(io)?;
    }
    // create_dir (not _all) fails if the folder appeared meanwhile.
    fs::create_dir(&path).map_err(io)
}

// ---- Tauri commands ----

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, VaultError> + Send + 'static,
) -> Result<T, VaultError> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| VaultError::new(ErrorKind::Io, e.to_string()))?
}

// ---- Vault management ----

fn vault_name(root: &Path) -> String {
    root.file_name().map_or("Vault".into(), |n| n.to_string_lossy().into_owned())
}

fn recents_file(app: &AppHandle) -> Result<PathBuf, VaultError> {
    let dir = app.path().app_config_dir().map_err(|e| VaultError::new(ErrorKind::Io, e.to_string()))?;
    Ok(dir.join("vaults.json"))
}

fn update_recents(app: &AppHandle, f: impl FnOnce(&mut Recents)) -> Result<(), VaultError> {
    let file = recents_file(app)?;
    let mut recents = Recents::load(&file);
    f(&mut recents);
    recents.save(&file).map_err(|e| VaultError::new(ErrorKind::Io, format!("Couldn't save recent vaults: {e}")))
}

/// Makes `dir` the open vault and records it as the most recent one.
fn open_root(app: &AppHandle, state: &VaultState, dir: &Path) -> Result<VaultInfo, VaultError> {
    let root = fs::canonicalize(dir).map_err(|e| VaultError::from_io(e, "vault"))?;
    if !root.is_dir() {
        return Err(VaultError::new(ErrorKind::NotFound, "The vault is not a folder"));
    }
    // Failing to remember the vault shouldn't stop it from opening.
    let _ = update_recents(app, |r| r.opened(&root));
    let info = VaultInfo { name: vault_name(&root), path: root.to_string_lossy().into_owned() };
    *state.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(root);
    Ok(info)
}

async fn pick_folder(app: &AppHandle) -> Result<Option<PathBuf>, VaultError> {
    let app = app.clone();
    let picked = blocking(move || Ok(app.dialog().file().blocking_pick_folder())).await?;
    Ok(picked.and_then(|p| p.into_path().ok()))
}

/// Opens a native folder picker; None if the user cancelled.
#[tauri::command]
pub async fn select_vault(app: AppHandle, state: State<'_, VaultState>) -> Result<Option<VaultInfo>, VaultError> {
    let Some(dir) = pick_folder(&app).await? else { return Ok(None) };
    open_root(&app, &state, &dir).map(Some)
}

/// Creates folder `name` inside a parent chosen with the folder picker, and opens it.
#[tauri::command]
pub async fn create_vault(app: AppHandle, state: State<'_, VaultState>, name: String) -> Result<Option<VaultInfo>, VaultError> {
    validate(&name, Kind::Folder, true)?;
    if name.contains('/') {
        return Err(VaultError::new(ErrorKind::InvalidPath, "A vault name can't contain '/'"));
    }
    let Some(parent) = pick_folder(&app).await? else { return Ok(None) };
    let dir = parent.join(&name);
    fs::create_dir(&dir).map_err(|e| VaultError::from_io(e, &name))?;
    open_root(&app, &state, &dir).map(Some)
}

/// Opens a vault from the recent list. Only listed paths are accepted, so the webview
/// can't open an arbitrary folder.
#[tauri::command]
pub async fn open_recent_vault(app: AppHandle, state: State<'_, VaultState>, path: String) -> Result<VaultInfo, VaultError> {
    let path = PathBuf::from(path);
    if !Recents::load(&recents_file(&app)?).vaults.contains(&path) {
        return Err(VaultError::new(ErrorKind::InvalidPath, "Not a recent vault"));
    }
    open_root(&app, &state, &path)
}

/// Reopens the vault that was open when the app last quit, if it still exists.
#[tauri::command]
pub async fn reopen_last_vault(app: AppHandle, state: State<'_, VaultState>) -> Result<Option<VaultInfo>, VaultError> {
    match Recents::load(&recents_file(&app)?).last_open {
        Some(root) if root.is_dir() => open_root(&app, &state, &root).map(Some),
        _ => Ok(None),
    }
}

#[tauri::command]
pub async fn recent_vaults(app: AppHandle) -> Result<Vec<RecentVault>, VaultError> {
    let recents = Recents::load(&recents_file(&app)?);
    Ok(recents
        .vaults
        .iter()
        .map(|root| RecentVault {
            name: vault_name(root),
            path: root.to_string_lossy().into_owned(),
            exists: root.is_dir(),
        })
        .collect())
}

#[tauri::command]
pub async fn forget_vault(app: AppHandle, path: String) -> Result<(), VaultError> {
    update_recents(&app, |r| r.forget(Path::new(&path)))
}

/// Closes the vault; it won't be reopened on next launch.
#[tauri::command]
pub async fn close_vault(app: AppHandle, state: State<'_, VaultState>) -> Result<(), VaultError> {
    *state.0.lock().unwrap_or_else(|e| e.into_inner()) = None;
    update_recents(&app, |r| r.last_open = None)
}

// ---- Note and folder commands ----

#[tauri::command]
pub async fn list_vault(state: State<'_, VaultState>) -> Result<VaultListing, VaultError> {
    let root = state.root()?;
    blocking(move || list(&root)).await
}

#[tauri::command]
pub async fn read_note(state: State<'_, VaultState>, path: String) -> Result<NoteContent, VaultError> {
    let root = state.root()?;
    blocking(move || read(&root, &path)).await
}

#[tauri::command]
pub async fn create_note(
    state: State<'_, VaultState>,
    path: String,
    content: Option<String>,
) -> Result<NoteEntry, VaultError> {
    let root = state.root()?;
    blocking(move || create(&root, &path, content.as_deref().unwrap_or(""))).await
}

#[tauri::command]
pub async fn write_note(
    state: State<'_, VaultState>,
    path: String,
    content: String,
    expected_modified: Option<u64>,
) -> Result<NoteEntry, VaultError> {
    let root = state.root()?;
    blocking(move || write(&root, &path, &content, expected_modified)).await
}

#[tauri::command]
pub async fn rename_note(state: State<'_, VaultState>, from: String, to: String) -> Result<NoteEntry, VaultError> {
    let root = state.root()?;
    blocking(move || {
        let dst = move_entry(&root, &from, &to, Kind::Note)?;
        entry(&dst, &to)
    })
    .await
}

#[tauri::command]
pub async fn delete_note(state: State<'_, VaultState>, path: String) -> Result<(), VaultError> {
    let root = state.root()?;
    blocking(move || delete(&root, &path, Kind::Note)).await
}

/// Opens a PDF, image or video with the system's default app. Only supported types are
/// accepted, so this can never launch an executable.
#[tauri::command]
pub async fn open_file(app: AppHandle, state: State<'_, VaultState>, path: String) -> Result<(), VaultError> {
    let root = state.root()?;
    let (_, real) = resolve_existing(&root, &path, Kind::File)?;
    if !real.is_file() {
        return Err(wrong_kind(&path, Kind::File));
    }
    app.opener()
        .open_path(real.to_string_lossy(), None::<&str>)
        .map_err(|e| VaultError::new(ErrorKind::Io, format!("{path}: couldn't open ({e})")))
}

/// Opens a web or mail link in the system's default app.
#[tauri::command]
pub async fn open_url(app: AppHandle, url: String) -> Result<(), VaultError> {
    let lower = url.to_ascii_lowercase();
    if !["https://", "http://", "mailto:"].iter().any(|scheme| lower.starts_with(scheme)) {
        return Err(VaultError::new(ErrorKind::InvalidPath, "Only http(s) and mailto links can be opened"));
    }
    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| VaultError::new(ErrorKind::Io, format!("Couldn't open link ({e})")))
}

#[tauri::command]
pub async fn create_folder(state: State<'_, VaultState>, path: String) -> Result<(), VaultError> {
    let root = state.root()?;
    blocking(move || create_folder_at(&root, &path)).await
}

#[tauri::command]
pub async fn rename_folder(state: State<'_, VaultState>, from: String, to: String) -> Result<(), VaultError> {
    let root = state.root()?;
    blocking(move || move_entry(&root, &from, &to, Kind::Folder).map(|_| ())).await
}

#[tauri::command]
pub async fn delete_folder(state: State<'_, VaultState>, path: String) -> Result<(), VaultError> {
    let root = state.root()?;
    blocking(move || delete(&root, &path, Kind::Folder)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        (dir, root)
    }

    #[test]
    fn create_read_and_no_duplicates() {
        let (_d, root) = vault();
        create(&root, "a/b/Note.md", "hi").unwrap();
        assert_eq!(read(&root, "a/b/Note.md").unwrap().content, "hi");
        let err = create(&root, "a/b/Note.md", "again").unwrap_err();
        assert_eq!(err.kind, ErrorKind::AlreadyExists);
        assert_eq!(read(&root, "a/b/Note.md").unwrap().content, "hi");
    }

    #[test]
    fn write_requires_existing_and_detects_conflicts() {
        let (_d, root) = vault();
        assert_eq!(write(&root, "x.md", "", None).unwrap_err().kind, ErrorKind::NotFound);

        let e = create(&root, "x.md", "v1").unwrap();
        let e = write(&root, "x.md", "v2", Some(e.modified)).unwrap();
        assert_eq!(read(&root, "x.md").unwrap().content, "v2");

        let stale = e.modified - 1;
        let err = write(&root, "x.md", "v3", Some(stale)).unwrap_err();
        assert_eq!(err.kind, ErrorKind::Conflict);
        assert_eq!(read(&root, "x.md").unwrap().content, "v2");
        assert!(!root.join(".x.md.rook-tmp").exists());
    }

    #[test]
    fn rename_never_overwrites() {
        let (_d, root) = vault();
        create(&root, "a.md", "a").unwrap();
        create(&root, "b.md", "b").unwrap();
        assert_eq!(move_entry(&root, "a.md", "b.md", Kind::Note).unwrap_err().kind, ErrorKind::AlreadyExists);
        assert_eq!(read(&root, "a.md").unwrap().content, "a");

        move_entry(&root, "a.md", "dir/c.md", Kind::Note).unwrap();
        assert_eq!(read(&root, "dir/c.md").unwrap().content, "a");
        assert_eq!(read(&root, "a.md").unwrap_err().kind, ErrorKind::NotFound);
    }

    #[test]
    fn delete_removes_note() {
        let (_d, root) = vault();
        create(&root, "a.md", "").unwrap();
        delete(&root, "a.md", Kind::Note).unwrap();
        assert_eq!(delete(&root, "a.md", Kind::Note).unwrap_err().kind, ErrorKind::NotFound);
    }

    #[test]
    fn list_skips_hidden_non_md_and_symlinks() {
        let (_d, root) = vault();
        create(&root, "b.md", "").unwrap();
        create(&root, "dir/a.md", "").unwrap();
        fs::create_dir(root.join(".git")).unwrap();
        fs::write(root.join(".git/x.md"), "").unwrap();
        fs::write(root.join("image.png"), "").unwrap();
        fs::write(root.join("dir/doc.pdf"), "").unwrap();
        fs::write(root.join("script.sh"), "").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(root.join("dir"), root.join("linked")).unwrap();

        fs::create_dir(root.join("empty")).unwrap();

        let listing = list(&root).unwrap();
        let paths: Vec<_> = listing.notes.into_iter().map(|n| n.path).collect();
        assert_eq!(paths, ["b.md", "dir/a.md"]);
        assert_eq!(listing.folders, ["dir", "empty"]);
        let files: Vec<_> = listing.files.iter().map(|f| (f.path.as_str(), f.kind)).collect();
        assert_eq!(files, [("dir/doc.pdf", "pdf"), ("image.png", "image")]);
    }

    #[test]
    fn folder_create_rename_delete() {
        let (_d, root) = vault();
        create_folder_at(&root, "a/b").unwrap();
        assert_eq!(create_folder_at(&root, "a/b").unwrap_err().kind, ErrorKind::AlreadyExists);
        create(&root, "a/b/n.md", "x").unwrap();
        create_folder_at(&root, "c").unwrap();

        assert_eq!(move_entry(&root, "a", "c", Kind::Folder).unwrap_err().kind, ErrorKind::AlreadyExists);
        assert_eq!(move_entry(&root, "a", "a/b/z", Kind::Folder).unwrap_err().kind, ErrorKind::InvalidPath);
        assert_eq!(move_entry(&root, "a/b/n.md", "q", Kind::Folder).unwrap_err().kind, ErrorKind::NotFound);
        move_entry(&root, "a", "c/a2", Kind::Folder).unwrap();
        assert_eq!(read(&root, "c/a2/b/n.md").unwrap().content, "x");

        assert_eq!(delete(&root, "c/a2/b/n.md", Kind::Folder).unwrap_err().kind, ErrorKind::NotFound);
        delete(&root, "c", Kind::Folder).unwrap();
        assert!(!root.join("c").exists());
    }

    #[cfg(unix)]
    #[test]
    fn delete_folder_does_not_follow_symlinks() {
        let (_d, root) = vault();
        let (_o, outside) = vault();
        fs::write(outside.join("keep.md"), "").unwrap();
        std::os::unix::fs::symlink(&outside, root.join("link")).unwrap();
        assert!(delete(&root, "link", Kind::Folder).is_err());
        assert!(outside.join("keep.md").exists());
    }

    #[test]
    fn invalid_utf8_is_reported() {
        let (_d, root) = vault();
        fs::write(root.join("bin.md"), [0xff, 0xfe]).unwrap();
        assert_eq!(read(&root, "bin.md").unwrap_err().kind, ErrorKind::InvalidEncoding);
    }

    #[cfg(unix)]
    #[test]
    fn read_only_file_reports_permission_denied() {
        use std::os::unix::fs::PermissionsExt;
        let (_d, root) = vault();
        create(&root, "ro.md", "").unwrap();
        fs::set_permissions(&root, fs::Permissions::from_mode(0o555)).unwrap();
        let err = write(&root, "ro.md", "x", None).unwrap_err();
        fs::set_permissions(&root, fs::Permissions::from_mode(0o755)).unwrap();
        assert_eq!(err.kind, ErrorKind::PermissionDenied);
    }
}

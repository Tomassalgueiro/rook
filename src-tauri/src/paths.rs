//! Validation and resolution of vault-relative note paths ("folder/Note.md").

use std::fs;
use std::path::{Component, Path, PathBuf};

use crate::vault::{ErrorKind, VaultError};

const RESERVED_NAMES: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Checks a vault-relative path without touching the filesystem.
///
/// `strict` adds the portability rules (Windows reserved characters and names, trailing
/// dots/spaces). It applies to names Rook creates; existing files only need the lenient rules
/// so notes made by other tools stay readable.
pub fn validate(rel: &str, strict: bool) -> Result<(), VaultError> {
    let invalid = |why: &str| {
        Err(VaultError::new(ErrorKind::InvalidPath, format!("Invalid path {rel:?}: {why}")))
    };

    if rel.is_empty() {
        return invalid("empty");
    }
    if rel.starts_with('/') || rel.contains('\\') {
        return invalid("must be relative and use '/' separators");
    }
    if !rel.to_ascii_lowercase().ends_with(".md") {
        return invalid("not a .md file");
    }
    // Belt and braces: the platform must see only plain names (no root, prefix or "..").
    if !Path::new(rel).components().all(|c| matches!(c, Component::Normal(_))) {
        return invalid("must be a plain relative path");
    }
    for part in rel.split('/') {
        if part.is_empty() || part == "." || part == ".." {
            return invalid("empty, '.' or '..' component");
        }
        if part.starts_with('.') {
            return invalid("hidden files and folders are not allowed");
        }
        if part.chars().any(char::is_control) {
            return invalid("control characters are not allowed");
        }
        // Drive prefixes and alternate data streams on Windows.
        if cfg!(windows) && part.contains(':') {
            return invalid("':' is not allowed");
        }
        if strict {
            if part.chars().any(|c| r#"<>:"|?*"#.contains(c)) {
                return invalid(r#"characters < > : " | ? * are not allowed"#);
            }
            if part.ends_with(' ') || part.ends_with('.') {
                return invalid("names cannot end with a space or a dot");
            }
            let stem = part.split('.').next().unwrap_or(part).trim_end().to_ascii_uppercase();
            if RESERVED_NAMES.contains(&stem.as_str()) {
                return invalid("reserved file name");
            }
        }
    }
    Ok(())
}

/// Resolves an existing note. Returns `(path, real)`: the joined path (acts on a symlink itself)
/// and its canonical target, which must lie inside the canonical `root`.
pub fn resolve_existing(root: &Path, rel: &str) -> Result<(PathBuf, PathBuf), VaultError> {
    validate(rel, false)?;
    let path = root.join(rel);
    let real = fs::canonicalize(&path).map_err(|e| VaultError::from_io(e, rel))?;
    if !real.starts_with(root) {
        return Err(outside(rel));
    }
    Ok((path, real))
}

/// Resolves a path for a note that must not exist yet. Its deepest existing ancestor must lie
/// inside the canonical `root`; missing folders are created later by the caller.
pub fn resolve_new(root: &Path, rel: &str) -> Result<PathBuf, VaultError> {
    validate(rel, true)?;
    let path = root.join(rel);
    if path.symlink_metadata().is_ok() {
        return Err(VaultError::new(ErrorKind::AlreadyExists, format!("{rel} already exists")));
    }
    let mut ancestor = path.parent().unwrap_or(root);
    while ancestor.symlink_metadata().is_err() {
        ancestor = ancestor.parent().unwrap_or(root);
    }
    let real = fs::canonicalize(ancestor).map_err(|e| VaultError::from_io(e, rel))?;
    if !real.starts_with(root) {
        return Err(outside(rel));
    }
    Ok(path)
}

fn outside(rel: &str) -> VaultError {
    VaultError::new(ErrorKind::OutsideVault, format!("{rel} resolves outside the vault"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_accepts_normal_paths() {
        for p in ["Note.md", "a/b/Note.MD", "Rook Roadmap.md", "2026-10-21.md", "ação.md"] {
            assert!(validate(p, true).is_ok(), "{p}");
        }
    }

    #[test]
    fn validate_rejects_bad_paths() {
        for p in [
            "", "/etc/x.md", "a\\b.md", "../x.md", "a/../x.md", "a//b.md", "./x.md",
            ".git/x.md", ".hidden.md", "note.txt", "note", "a\0b.md", "a\nb.md",
        ] {
            let err = validate(p, false).unwrap_err();
            assert_eq!(err.kind, ErrorKind::InvalidPath, "{p:?}");
        }
    }

    #[test]
    fn strict_rejects_unportable_names() {
        for p in ["a:b.md", "C:/x.md", "what?.md", "dir./x.md", "dir /x.md", "CON.md", "con.md", "nul.txt.md", "LPT1.md"] {
            if !(cfg!(windows) && p.contains(':')) {
                assert!(validate(p, false).is_ok(), "lenient {p}");
            }
            assert_eq!(validate(p, true).unwrap_err().kind, ErrorKind::InvalidPath, "{p}");
        }
    }

    fn vault() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        (dir, root)
    }

    #[test]
    fn resolve_existing_and_new() {
        let (_dir, root) = vault();
        fs::write(root.join("a.md"), "").unwrap();
        assert!(resolve_existing(&root, "a.md").is_ok());
        assert_eq!(resolve_existing(&root, "b.md").unwrap_err().kind, ErrorKind::NotFound);
        assert!(resolve_new(&root, "x/y/b.md").is_ok());
        assert_eq!(resolve_new(&root, "a.md").unwrap_err().kind, ErrorKind::AlreadyExists);
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_cannot_escape() {
        use std::os::unix::fs::symlink;
        let (_dir, root) = vault();
        let (_out_dir, outside) = vault();
        fs::write(outside.join("secret.md"), "").unwrap();
        symlink(outside.join("secret.md"), root.join("link.md")).unwrap();
        symlink(&outside, root.join("out")).unwrap();

        assert_eq!(resolve_existing(&root, "link.md").unwrap_err().kind, ErrorKind::OutsideVault);
        assert_eq!(resolve_existing(&root, "out/secret.md").unwrap_err().kind, ErrorKind::OutsideVault);
        assert_eq!(resolve_new(&root, "out/new.md").unwrap_err().kind, ErrorKind::OutsideVault);

        fs::write(root.join("real.md"), "").unwrap();
        symlink(root.join("real.md"), root.join("inside.md")).unwrap();
        assert!(resolve_existing(&root, "inside.md").is_ok());
    }
}

//! Recently opened vaults, persisted as JSON in the app config folder.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

const MAX_RECENT: usize = 10;

#[derive(Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Recents {
    /// Canonical vault roots, most recent first.
    #[serde(default)]
    pub vaults: Vec<PathBuf>,
    /// Vault to reopen on launch; cleared when the user closes it.
    #[serde(default)]
    pub last_open: Option<PathBuf>,
}

impl Recents {
    /// A missing or corrupt file just means no recents.
    pub fn load(file: &Path) -> Self {
        fs::read(file)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, file: &Path) -> io::Result<()> {
        if let Some(dir) = file.parent() {
            fs::create_dir_all(dir)?;
        }
        fs::write(file, serde_json::to_vec_pretty(self).map_err(io::Error::other)?)
    }

    pub fn opened(&mut self, root: &Path) {
        self.vaults.retain(|p| p != root);
        self.vaults.insert(0, root.to_path_buf());
        self.vaults.truncate(MAX_RECENT);
        self.last_open = Some(root.to_path_buf());
    }

    pub fn forget(&mut self, root: &Path) {
        self.vaults.retain(|p| p != root);
        if self.last_open.as_deref() == Some(root) {
            self.last_open = None;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opened_moves_to_front_dedupes_and_caps() {
        let mut r = Recents::default();
        for i in 0..12 {
            r.opened(Path::new(&format!("/v{i}")));
        }
        r.opened(Path::new("/v5"));
        assert_eq!(r.vaults.len(), MAX_RECENT);
        assert_eq!(r.vaults[0], Path::new("/v5"));
        assert_eq!(r.vaults.iter().filter(|p| p.as_path() == Path::new("/v5")).count(), 1);
        assert_eq!(r.last_open.as_deref(), Some(Path::new("/v5")));
    }

    #[test]
    fn forget_clears_last_open() {
        let mut r = Recents::default();
        r.opened(Path::new("/a"));
        r.opened(Path::new("/b"));
        r.forget(Path::new("/b"));
        assert_eq!(r.vaults, [PathBuf::from("/a")]);
        assert_eq!(r.last_open, None);
    }

    #[test]
    fn load_save_roundtrip_and_corrupt_file() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("cfg/vaults.json");
        assert_eq!(Recents::load(&file), Recents::default());

        let mut r = Recents::default();
        r.opened(Path::new("/a"));
        r.save(&file).unwrap();
        assert_eq!(Recents::load(&file), r);

        fs::write(&file, "not json").unwrap();
        assert_eq!(Recents::load(&file), Recents::default());
    }
}

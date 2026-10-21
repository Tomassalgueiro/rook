// Typed wrappers for the Rust vault commands (src-tauri/src/vault.rs).
import { invoke } from "@tauri-apps/api/core";

export interface VaultInfo {
  name: string;
  /** Absolute root, for display only. */
  path: string;
}

export interface RecentVault {
  name: string;
  path: string;
  exists: boolean;
}

/** `path` is vault-relative with "/" separators; `modified` is ms since the Unix epoch. */
export interface NoteEntry {
  path: string;
  modified: number;
}

export type FileKind = "pdf" | "image" | "video";

/** A non-note file shown in the sidebar. */
export interface FileEntry {
  path: string;
  kind: FileKind;
}

/** Folders are listed separately so empty ones still show up. */
export interface VaultListing {
  notes: NoteEntry[];
  files: FileEntry[];
  folders: string[];
}

export interface NoteContent extends NoteEntry {
  content: string;
}

export type VaultErrorKind =
  | "NoVault"
  | "InvalidPath"
  | "OutsideVault"
  | "NotFound"
  | "AlreadyExists"
  | "Conflict"
  | "PermissionDenied"
  | "InvalidEncoding"
  | "Io";

export interface VaultError {
  kind: VaultErrorKind;
  message: string;
}

export function isVaultError(e: unknown): e is VaultError {
  return typeof e === "object" && e !== null && "kind" in e && "message" in e;
}

export function errorMessage(e: unknown): string {
  return isVaultError(e) ? e.message : String(e);
}

/** Opens the native folder picker; resolves to null if the user cancels. */
export const selectVault = () => invoke<VaultInfo | null>("select_vault");
/** Asks for a parent folder, creates `name` inside it and opens it; null if cancelled. */
export const createVault = (name: string) => invoke<VaultInfo | null>("create_vault", { name });
/** Only paths from `recentVaults()` are accepted. */
export const openRecentVault = (path: string) => invoke<VaultInfo>("open_recent_vault", { path });
/** Reopens the vault open at last quit, if any. */
export const reopenLastVault = () => invoke<VaultInfo | null>("reopen_last_vault");
export const recentVaults = () => invoke<RecentVault[]>("recent_vaults");
export const forgetVault = (path: string) => invoke<void>("forget_vault", { path });
/** Closes the vault so it isn't reopened on next launch. */
export const closeVault = () => invoke<void>("close_vault");
export const listVault = () => invoke<VaultListing>("list_vault");
export const readNote = (path: string) => invoke<NoteContent>("read_note", { path });
export const createNote = (path: string, content?: string) =>
  invoke<NoteEntry>("create_note", { path, content });
/** Fails with "Conflict" if the file's mtime no longer matches `expectedModified`. */
export const writeNote = (path: string, content: string, expectedModified?: number) =>
  invoke<NoteEntry>("write_note", { path, content, expectedModified });
export const renameNote = (from: string, to: string) => invoke<NoteEntry>("rename_note", { from, to });
export const deleteNote = (path: string) => invoke<void>("delete_note", { path });
/** Opens a PDF, image or video with the system's default app. */
export const openFile = (path: string) => invoke<void>("open_file", { path });
/** Moves or renames a PDF, image or video; never overwrites. */
export const moveFile = (from: string, to: string) => invoke<void>("move_file", { from, to });
/** Opens an http(s) or mailto link in the system's default app. */
export const openUrl = (url: string) => invoke<void>("open_url", { url });
export const createFolder = (path: string) => invoke<void>("create_folder", { path });
export const renameFolder = (from: string, to: string) => invoke<void>("rename_folder", { from, to });
/** Permanently deletes the folder and everything in it. */
export const deleteFolder = (path: string) => invoke<void>("delete_folder", { path });

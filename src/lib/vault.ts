// Typed wrappers for the Rust vault commands (src-tauri/src/vault.rs).
import { invoke } from "@tauri-apps/api/core";

export interface VaultInfo {
  name: string;
}

/** `path` is vault-relative with "/" separators; `modified` is ms since the Unix epoch. */
export interface NoteEntry {
  path: string;
  modified: number;
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
export const listNotes = () => invoke<NoteEntry[]>("list_notes");
export const readNote = (path: string) => invoke<NoteContent>("read_note", { path });
export const createNote = (path: string, content?: string) =>
  invoke<NoteEntry>("create_note", { path, content });
/** Fails with "Conflict" if the file's mtime no longer matches `expectedModified`. */
export const writeNote = (path: string, content: string, expectedModified?: number) =>
  invoke<NoteEntry>("write_note", { path, content, expectedModified });
export const renameNote = (from: string, to: string) => invoke<NoteEntry>("rename_note", { from, to });
export const deleteNote = (path: string) => invoke<void>("delete_note", { path });

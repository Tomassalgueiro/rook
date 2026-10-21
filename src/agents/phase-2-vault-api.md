# Rook — Phase 2 Preparation: Vault API Design

## Objective

Design a minimal, safe Rust/Tauri API for managing a directory of Markdown notes. Do not build a second UI or modify the Svelte components.

## Requirements

Inspect the existing Tauri scaffold and propose typed commands for:

- Selecting a vault directory.
- Listing Markdown files recursively.
- Reading a note.
- Creating a note.
- Writing a note.
- Renaming a note.
- Deleting a note.

## Safety

- Validate paths against the selected vault.
- Reject paths that escape the vault directory.
- Handle missing files, duplicate filenames, invalid paths and permission errors.
- Avoid silently overwriting existing notes.
- Keep filesystem operations asynchronous where appropriate.
- Return structured, serializable errors.
- Consider symlinks and path traversal on Linux and Windows.
- Do not add SQLite or a complex abstraction layer.

## Deliverables

1. Proposed TypeScript request/response types.
2. Proposed Rust command signatures.
3. Security and error-handling decisions.
4. Minimal test plan.
5. A short integration guide for the frontend agent.

Do not implement the commands until the API contract has been reviewed and agreed upon.

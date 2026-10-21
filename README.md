# Rook

A lightweight, Obsidian-inspired desktop note-taking app built with Tauri, Svelte, TypeScript, and Rust.

## Requirements

- Node.js
- pnpm
- Rust toolchain (`rustup`, `rustc`, `cargo`)
- Tauri system dependencies ([Fedora setup](https://v2.tauri.app/start/prerequisites/))

## Development

Enter the project directory:

```bash
cd rook
```

Install dependencies:

```bash
pnpm install
```

Start the desktop app in development mode:

```bash
pnpm tauri dev
```

The app window will open automatically. Changes to the frontend will generally trigger a hot reload.

## Production Build

Build the application for your current platform:

```bash
pnpm tauri build
```

The generated packages and binaries will be available under:

```text
src-tauri/target/release/bundle/
```

## Tech Stack

- **Tauri 2** — Desktop application runtime
- **Svelte** — UI framework
- **TypeScript** — Frontend language
- **Rust** — Native backend
- **pnpm** — Package manager


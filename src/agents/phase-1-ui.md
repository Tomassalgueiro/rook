# Rook — Phase 1: UI Shell

## Context

Rook is a lightweight, cross-platform desktop note-taking application inspired by Obsidian.

### Stack
- Tauri 2
- Svelte
- TypeScript
- Rust
- pnpm

The project has already been scaffolded using `pnpm create tauri-app`. Preserve the existing setup and inspect the repository before making changes.

## Objective

Replace the default starter screen with a clean, lightweight note-taking interface. This phase is UI-only: use mock data and do not implement filesystem operations yet.

## Requirements

1. Create a three-pane desktop layout:
   - Left sidebar containing vault name, note tree and basic navigation.
   - Center panel containing the active note title and editor placeholder.
   - Optional collapsible right panel reserved for backlinks.

2. Add:
   - Collapsible sidebar.
   - Top toolbar with create-note and search controls.
   - Bottom status bar.
   - Empty states for when no vault or note is selected.
   - Dark theme using CSS custom properties.
   - Keyboard shortcut hints where appropriate.

3. Keep the design minimal and fast:
   - Avoid large UI component libraries.
   - Avoid unnecessary dependencies and animations.
   - Use reusable, small Svelte components.
   - Make the interface responsive to different window sizes.

4. Use mock notes to demonstrate the UI, but keep mock data separate so it can be replaced with real vault data later.

## Constraints

- Do not change the Tauri project configuration unless necessary.
- Do not introduce a database.
- Do not implement filesystem access in this phase.
- Do not overwrite unrelated files.
- Preserve TypeScript type safety.

## Acceptance criteria

- `pnpm tauri dev` launches successfully.
- The starter screen is replaced with the new UI.
- Sidebar and right panel can be toggled.
- Components are organized sensibly.
- No TypeScript errors or console errors.
- `pnpm build` succeeds.

## Deliverables

1. Implemented UI.
2. List of files created or changed.
3. Brief explanation of component structure.
4. Commands run and their results.
5. Known limitations and recommended next steps.

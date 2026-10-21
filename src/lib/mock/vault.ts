import type { Vault } from "../types";

// Demo data for the UI shell. Replaced by real vault data in phase 2.
export const mockVault: Vault = {
  name: "Demo Vault",
  notes: [
    {
      path: "Welcome.md",
      content:
        "# Welcome to Rook\n\nRook is a lightweight, local-first notes app.\n\nStart with [[Getting Started]] or browse [[Rook Roadmap]].",
    },
    {
      path: "Getting Started.md",
      content:
        "# Getting Started\n\n- Notes are plain Markdown files.\n- Link notes with [[Welcome]]-style wikilinks.\n- Toggle the sidebar with Ctrl+\\.",
    },
    {
      path: "projects/Rook Roadmap.md",
      content:
        "# Roadmap\n\n1. UI shell\n2. Vault API\n3. Markdown editor\n\nSee [[Getting Started]].",
    },
    {
      path: "projects/ideas/Graph View.md",
      content: "# Graph View\n\nMaybe later. Related: [[Rook Roadmap]].",
    },
    {
      path: "journal/2026-10-21.md",
      content: "Worked on the [[Rook Roadmap]] today.",
    },
  ],
};

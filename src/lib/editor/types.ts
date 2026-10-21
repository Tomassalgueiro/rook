/** What a clicked link points to. */
export type LinkTarget = { kind: "wiki"; target: string } | { kind: "url"; href: string };

/** A [[ autocomplete entry. */
export interface LinkOption {
  /** Text inserted between the brackets: a note title, a path if titles clash, or a file name. */
  label: string;
  /** Shown dimmed next to the label, e.g. the folder. */
  detail?: string;
}

/** The editor's view of the vault, for link suggestions and styling. Called lazily, so always current. */
export interface LinkProvider {
  /** Notes and files to suggest after "[[". */
  targets(): LinkOption[];
  /** Headings of the note a link name points to ("" = the current note). */
  headings(name: string): string[];
  /** Whether a [[wikilink]] target resolves to an existing note or file. */
  exists(target: string): boolean;
}

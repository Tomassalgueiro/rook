// App preferences. Per machine, so localStorage is enough (like the panel widths).

export interface Settings {
  accent: string;
  font: "sans" | "serif" | "mono";
  fontSize: number;
  width: "readable" | "wide" | "full";
  /** "line": hide Markdown syntax except on the line being edited; "always": always show it. */
  syntax: "line" | "always";
  spellcheck: boolean;
  /** Vim keybindings in the editor; Vim wins any key it uses there. */
  vim: boolean;
  /** Rewrite links when notes, files or folders move. */
  updateLinks: boolean;
}

export const defaults: Settings = {
  accent: "#9d8cf5",
  font: "sans",
  fontSize: 16,
  width: "readable",
  syntax: "line",
  spellcheck: false,
  vim: false,
  updateLinks: true,
};

export const accents = ["#9d8cf5", "#6aa7f8", "#5fc28a", "#f0a35e", "#ec7fb8", "#e3e3e6"];

const fonts: Record<Settings["font"], string> = {
  sans: "var(--font-ui)",
  serif: '"Iowan Old Style", "Palatino Linotype", Charter, Georgia, serif',
  mono: "var(--font-mono)",
};

const widths: Record<Settings["width"], string> = { readable: "720px", wide: "960px", full: "none" };

const KEY = "rook.settings";

export function loadSettings(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...defaults };
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable; settings just won't persist.
  }
}

/** CSS custom properties that apply the settings (set on <html>). */
export function cssVars(s: Settings): Record<string, string> {
  return {
    "--accent": s.accent,
    "--font-text": fonts[s.font] ?? fonts.sans,
    "--editor-size": `${s.fontSize}px`,
    "--content-width": widths[s.width] ?? widths.readable,
  };
}

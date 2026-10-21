<script lang="ts">
  import { accents, defaults, type Settings } from "../settings";
  import Icon from "./Icon.svelte";

  let { settings = $bindable() }: { settings: Settings } = $props();
  let dialog: HTMLDialogElement;

  export function open() {
    dialog.showModal();
  }

  const fonts: [Settings["font"], string][] = [
    ["sans", "Sans"],
    ["serif", "Serif"],
    ["mono", "Mono"],
  ];
  const widths: [Settings["width"], string][] = [
    ["readable", "Readable"],
    ["wide", "Wide"],
    ["full", "Full"],
  ];
  const syntaxModes: [Settings["syntax"], string][] = [
    ["line", "While editing a line"],
    ["always", "Always"],
  ];
</script>

<dialog bind:this={dialog} aria-labelledby="settings-title">
  <header>
    <h2 id="settings-title">Settings</h2>
    <button class="icon" aria-label="Close settings" onclick={() => dialog.close()}><Icon name="x" /></button>
  </header>

  <section>
    <h3>Appearance</h3>
    <div class="row">
      <span class="label">Accent color</span>
      <div class="swatches" role="radiogroup" aria-label="Accent color">
        {#each accents as color (color)}
          <button
            class="swatch"
            role="radio"
            aria-checked={settings.accent === color}
            aria-label={color}
            style:background={color}
            onclick={() => (settings.accent = color)}
          ></button>
        {/each}
      </div>
    </div>
    <div class="row">
      <span class="label">Text font</span>
      <div class="segmented" role="radiogroup" aria-label="Text font">
        {#each fonts as [value, label] (value)}
          <button role="radio" aria-checked={settings.font === value} onclick={() => (settings.font = value)}>{label}</button>
        {/each}
      </div>
    </div>
    <label class="row">
      <span class="label">Font size</span>
      <span class="range">
        <input type="range" min="13" max="22" step="1" bind:value={settings.fontSize} />
        <span class="value">{settings.fontSize}px</span>
      </span>
    </label>
    <div class="row">
      <span class="label">Line width</span>
      <div class="segmented" role="radiogroup" aria-label="Line width">
        {#each widths as [value, label] (value)}
          <button role="radio" aria-checked={settings.width === value} onclick={() => (settings.width = value)}>{label}</button>
        {/each}
      </div>
    </div>
  </section>

  <section>
    <h3>Editor</h3>
    <div class="row">
      <span class="label">Show Markdown syntax</span>
      <div class="segmented" role="radiogroup" aria-label="Show Markdown syntax">
        {#each syntaxModes as [value, label] (value)}
          <button role="radio" aria-checked={settings.syntax === value} onclick={() => (settings.syntax = value)}>{label}</button>
        {/each}
      </div>
    </div>
    <label class="row">
      <span class="label">Spellcheck</span>
      <input type="checkbox" bind:checked={settings.spellcheck} />
    </label>
    <label class="row">
      <span class="label">
        Vim mode
        <small>Vim keys win inside the editor; Rook shortcuts work for keys Vim doesn't use. :w saves.</small>
      </span>
      <input type="checkbox" bind:checked={settings.vim} />
    </label>
  </section>

  <section>
    <h3>Links</h3>
    <label class="row">
      <span class="label">
        Update links when moving notes
        <small>Rewrites links in other notes when a note, file or folder is moved or renamed.</small>
      </span>
      <input type="checkbox" bind:checked={settings.updateLinks} />
    </label>
  </section>

  <footer>
    <button onclick={() => (settings = { ...defaults })}>Reset to defaults</button>
  </footer>
</dialog>

<style>
  dialog {
    width: min(520px, calc(100vw - 32px));
    max-height: calc(100vh - 64px);
    color: inherit;
    background: var(--bg-alt);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0;
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.5);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 12px 4px 20px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  section {
    padding: 4px 20px 12px;
  }
  h3 {
    margin: 12px 0 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-faint);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 36px;
    padding: 4px 0;
  }
  .label {
    display: flex;
    flex-direction: column;
  }
  small {
    font-size: 12px;
    color: var(--text-faint);
  }
  .swatches {
    display: flex;
    gap: 6px;
  }
  .swatch {
    width: 20px;
    height: 20px;
    padding: 0;
    border-radius: 50%;
    border: 2px solid transparent;
  }
  .swatch[aria-checked="true"] {
    box-shadow: 0 0 0 2px var(--bg-alt), 0 0 0 3px var(--text);
  }
  .segmented {
    display: flex;
    padding: 2px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .segmented button {
    padding: 3px 10px;
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .segmented button[aria-checked="true"] {
    color: var(--text);
    background: var(--bg-active);
  }
  .range {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .value {
    width: 36px;
    text-align: right;
    font-size: 12px;
    color: var(--text-muted);
  }
  input[type="range"],
  input[type="checkbox"] {
    accent-color: var(--accent);
  }
  input[type="checkbox"] {
    width: 16px;
    height: 16px;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    padding: 8px 20px 16px;
    border-top: 1px solid var(--border);
  }
  footer button {
    border: 1px solid var(--border);
    font-size: 12.5px;
  }
</style>

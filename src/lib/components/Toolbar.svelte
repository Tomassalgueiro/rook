<script lang="ts">
  import Icon from "./Icon.svelte";

  interface Props {
    query: string;
    sidebarOpen: boolean;
    backlinksOpen: boolean;
    disabled: boolean;
    ontogglesidebar: () => void;
    ontogglebacklinks: () => void;
    onnewnote: () => void;
    searchInput?: HTMLInputElement;
  }
  let {
    query = $bindable(),
    sidebarOpen,
    backlinksOpen,
    disabled,
    ontogglesidebar,
    ontogglebacklinks,
    onnewnote,
    searchInput = $bindable(),
  }: Props = $props();
</script>

<header>
  <button class="icon" title="Toggle sidebar (Ctrl+\)" aria-label="Toggle sidebar" aria-pressed={sidebarOpen} onclick={ontogglesidebar}>
    <Icon name="panel-left" />
  </button>
  <button class="icon" title="New note (Ctrl+N)" aria-label="New note" {disabled} onclick={onnewnote}>
    <Icon name="file-plus" />
  </button>
  <label class="search">
    <Icon name="search" size={14} />
    <input type="search" placeholder="Search notes" bind:value={query} bind:this={searchInput} {disabled} />
    <kbd>Ctrl K</kbd>
  </label>
  <button
    class="icon"
    title="Toggle backlinks (Ctrl+Shift+B)"
    aria-label="Toggle backlinks"
    aria-pressed={backlinksOpen}
    onclick={ontogglebacklinks}
  >
    <Icon name="panel-right" />
  </button>
</header>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 2px;
    height: var(--bar-h);
    padding: 0 6px;
    background: var(--bg-alt);
    border-bottom: 1px solid var(--border);
  }
  .icon {
    color: var(--text-faint);
  }
  .icon:hover:not(:disabled) {
    color: var(--text);
  }
  .icon[aria-pressed="true"] {
    color: var(--text-muted);
  }
  .icon:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .search {
    flex: 0 1 320px;
    min-width: 100px;
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 auto;
    padding: 3px 8px;
    color: var(--text-faint);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .search:focus-within {
    border-color: var(--accent);
  }
  input {
    flex: 1;
    min-width: 0;
    font: inherit;
    color: var(--text);
    background: none;
    border: 0;
    padding: 0;
  }
  input:focus-visible {
    outline: none;
  }
  @media (max-width: 640px) {
    kbd {
      display: none;
    }
  }
</style>

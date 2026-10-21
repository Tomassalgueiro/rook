<script lang="ts">
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
  <button title="Toggle sidebar (Ctrl+\)" aria-pressed={sidebarOpen} onclick={ontogglesidebar}>☰</button>
  <button title="New note (Ctrl+N)" {disabled} onclick={onnewnote}>＋ New</button>
  <input
    type="search"
    placeholder="Search notes…  Ctrl+K"
    bind:value={query}
    bind:this={searchInput}
    {disabled}
  />
  <button
    class="right"
    title="Toggle backlinks (Ctrl+Shift+B)"
    aria-pressed={backlinksOpen}
    onclick={ontogglebacklinks}>⇄</button
  >
</header>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 4px;
    height: var(--bar-h);
    padding: 0 6px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-alt);
  }
  button[aria-pressed="true"] {
    color: var(--accent);
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  input {
    flex: 0 1 280px;
    min-width: 80px;
    font: inherit;
    color: inherit;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 2px 8px;
  }
  .right {
    margin-left: auto;
  }
</style>

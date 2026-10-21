<script lang="ts">
  import type { RecentVault } from "../vault";

  interface Props {
    recent: RecentVault[];
    onopen: () => void;
    oncreate: () => void;
    onopenrecent: (path: string) => void;
    onforget: (path: string) => void;
  }
  let { recent, onopen, oncreate, onopenrecent, onforget }: Props = $props();
</script>

<div class="picker">
  <h2>Open a vault</h2>
  <p class="muted">A vault is a folder of Markdown notes.</p>
  <div class="actions">
    <button class="primary" onclick={onopen}>Open folder… <kbd>Ctrl O</kbd></button>
    <button onclick={oncreate}>Create new vault…</button>
  </div>

  {#if recent.length}
    <h3>Recent</h3>
    <ul>
      {#each recent as vault (vault.path)}
        <li>
          <button class="vault" disabled={!vault.exists} title={vault.path} onclick={() => onopenrecent(vault.path)}>
            <span>{vault.name}</span>
            <span class="muted path">{vault.exists ? vault.path : "Folder not found"}</span>
          </button>
          <button class="muted" title="Remove from list" aria-label="Remove {vault.name} from list" onclick={() => onforget(vault.path)}
            >✕</button
          >
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .picker {
    width: min(440px, 100%);
    margin: auto;
    padding: 24px 16px;
  }
  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 500;
  }
  h3 {
    margin: 24px 0 4px;
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .actions button {
    border: 1px solid var(--border);
    padding: 6px 14px;
  }
  .primary {
    background: var(--accent);
    border-color: var(--accent) !important;
    color: #fff;
  }
  .primary kbd {
    color: inherit;
    border-color: rgb(255 255 255 / 0.4);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    align-items: center;
  }
  .vault {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    text-align: left;
    padding: 6px 8px;
  }
  .vault:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .path {
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>

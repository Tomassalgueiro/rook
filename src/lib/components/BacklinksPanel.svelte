<script lang="ts">
  import type { Note } from "../types";
  import { noteTitle } from "../notes";

  let { links, onselect }: { links: Note[]; onselect: (path: string) => void } = $props();
</script>

<aside>
  <header>Backlinks</header>
  {#if links.length}
    <ul>
      {#each links as link (link.path)}
        <li><button onclick={() => onselect(link.path)}>{noteTitle(link.path)}</button></li>
      {/each}
    </ul>
  {:else}
    <p class="muted">No backlinks</p>
  {/if}
</aside>

<style>
  aside {
    width: var(--panel-w);
    background: var(--bg-alt);
    border-left: 1px solid var(--border);
    overflow-y: auto;
  }
  header {
    display: flex;
    align-items: center;
    height: var(--bar-h);
    padding: 0 12px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 4px 0;
  }
  button {
    width: 100%;
    text-align: left;
    border-radius: 0;
    padding: 2px 12px;
  }
  p {
    padding: 0 12px;
  }
  @media (max-width: 640px) {
    aside {
      display: none;
    }
  }
</style>

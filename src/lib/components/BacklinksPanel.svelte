<script lang="ts">
  import type { Note } from "../types";
  import { noteTitle } from "../notes";
  import Icon from "./Icon.svelte";

  let { links, onselect }: { links: Note[]; onselect: (path: string) => void } = $props();
</script>

<aside>
  <header>Backlinks</header>
  {#if links.length}
    <ul>
      {#each links as link (link.path)}
        <li>
          <button title={link.path} onclick={() => onselect(link.path)}>
            <Icon name="file" size={15} />
            <span>{noteTitle(link.path)}</span>
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <p>No backlinks</p>
  {/if}
</aside>

<style>
  aside {
    flex: 0 0 var(--panel-w);
    min-width: 0;
    background: var(--bg-alt);
    overflow-y: auto;
    padding: 0 6px;
  }
  header {
    display: flex;
    align-items: center;
    height: var(--bar-h);
    padding: 0 8px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-faint);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  button {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    text-align: left;
    padding: 3px 8px;
    color: var(--text-muted);
  }
  button :global(svg) {
    color: var(--text-faint);
  }
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  p {
    padding: 0 8px;
    color: var(--text-faint);
  }
  @media (max-width: 640px) {
    aside {
      display: none;
    }
  }
</style>

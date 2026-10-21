<script lang="ts">
  import type { SearchHit } from "../search";
  import Icon, { fileIcons } from "./Icon.svelte";

  let { hits, onopen }: { hits: SearchHit[]; onopen: (hit: SearchHit) => void } = $props();
</script>

<p class="count">{hits.length ? `${hits.length}${hits.length >= 100 ? "+" : ""} results` : "No results"}</p>
<ul>
  {#each hits as hit (hit.path)}
    <li>
      <button class="hit {hit.kind}" title={hit.path} onclick={() => onopen(hit)}>
        <span class="head">
          <Icon name={hit.kind === "note" ? "file" : fileIcons[hit.kind]} size={14} />
          <span class="title">{hit.title}</span>
          {#if hit.count > 1}<span class="badge">{hit.count}</span>{/if}
        </span>
        {#if hit.folder}<span class="folder">{hit.folder}</span>{/if}
        {#if hit.match}
          <span class="snippet">{hit.match.before}<mark>{hit.match.text}</mark>{hit.match.after}</span>
        {/if}
      </button>
    </li>
  {/each}
</ul>

<style>
  .count {
    margin: 2px 8px 6px;
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
  .hit {
    display: flex;
    flex-direction: column;
    gap: 1px;
    width: 100%;
    margin: 1px 0;
    padding: 5px 8px;
    text-align: left;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .head :global(svg) {
    color: var(--text-faint);
  }
  .hit.pdf .head :global(svg) {
    color: var(--file-pdf);
  }
  .hit.image .head :global(svg) {
    color: var(--file-image);
  }
  .hit.video .head :global(svg) {
    color: var(--file-video);
  }
  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }
  .badge {
    font-size: 10.5px;
    color: var(--text-faint);
  }
  .folder {
    padding-left: 20px;
    font-size: 11.5px;
    color: var(--text-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .snippet {
    padding-left: 20px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-muted);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  mark {
    color: var(--text);
    background: var(--selection);
    border-radius: 2px;
  }
</style>

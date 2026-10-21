<script lang="ts">
  import { tick } from "svelte";

  let dialog: HTMLDialogElement;
  let input = $state<HTMLInputElement>();
  let message = $state("");
  let confirmLabel = $state("OK");
  let cancelLabel = $state("Cancel");
  let value = $state<string | null>(null); // null = confirm only, no text field
  let resolve: ((ok: boolean) => void) | null = null;

  async function open(text: string, confirm: string, cancel: string): Promise<boolean> {
    message = text;
    confirmLabel = confirm;
    cancelLabel = cancel;
    await tick();
    dialog.showModal();
    input?.select();
    return new Promise((r) => (resolve = r));
  }

  /** Shows a modal question; resolves true for confirm, false for cancel/Escape. */
  export function ask(text: string, confirm = "OK", cancel = "Cancel"): Promise<boolean> {
    value = null;
    return open(text, confirm, cancel);
  }

  /** Asks for a line of text; resolves to the trimmed text, or null if cancelled or empty. */
  export async function prompt(text: string, initial = "", confirm = "OK"): Promise<string | null> {
    value = initial;
    const ok = await open(text, confirm, "Cancel");
    return ok ? value?.trim() || null : null;
  }

  function close(ok: boolean) {
    dialog.close();
    resolve?.(ok);
    resolve = null;
  }
</script>

<dialog
  bind:this={dialog}
  oncancel={(e) => {
    e.preventDefault();
    close(false);
  }}
>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      close(true);
    }}
  >
    <p>{message}</p>
    {#if value !== null}
      <input bind:this={input} bind:value aria-label={message} />
    {/if}
    <div>
      <button type="button" onclick={() => close(false)}>{cancelLabel}</button>
      <button type="submit" class="confirm">{confirmLabel}</button>
    </div>
  </form>
</dialog>

<style>
  dialog {
    width: min(420px, calc(100vw - 32px));
    color: inherit;
    background: var(--bg-alt);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 16px;
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.5);
  }
  p {
    margin: 0 0 12px;
  }
  input {
    width: 100%;
    margin-bottom: 16px;
    font: inherit;
    color: inherit;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 4px 8px;
  }
  div {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  button {
    border: 1px solid var(--border);
    padding: 4px 12px;
  }
  .confirm {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
</style>

<script lang="ts">
  let dialog: HTMLDialogElement;
  let message = $state("");
  let confirmLabel = $state("OK");
  let cancelLabel = $state("Cancel");
  let resolve: ((ok: boolean) => void) | null = null;

  /** Shows a modal question; resolves true for confirm, false for cancel/Escape. */
  export function ask(text: string, confirm = "OK", cancel = "Cancel"): Promise<boolean> {
    message = text;
    confirmLabel = confirm;
    cancelLabel = cancel;
    dialog.showModal();
    return new Promise((r) => (resolve = r));
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
  <p>{message}</p>
  <div>
    <button onclick={() => close(false)}>{cancelLabel}</button>
    <button class="confirm" onclick={() => close(true)}>{confirmLabel}</button>
  </div>
</dialog>

<style>
  dialog {
    max-width: min(420px, calc(100vw - 32px));
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
    margin: 0 0 16px;
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

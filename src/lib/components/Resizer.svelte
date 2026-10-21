<script lang="ts">
  interface Props {
    width: number;
    /** 1 if dragging right grows the panel (left sidebar), -1 for a right panel. */
    direction: 1 | -1;
    label: string;
    min?: number;
    max?: number;
  }
  let { width = $bindable(), direction, label, min = 160, max = 520 }: Props = $props();

  const clamp = (w: number) => Math.round(Math.min(max, Math.max(min, w)));

  function onpointerdown(e: PointerEvent & { currentTarget: HTMLElement }) {
    const handle = e.currentTarget;
    const startX = e.clientX;
    const startWidth = width;
    handle.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => (width = clamp(startWidth + (ev.clientX - startX) * direction));
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  }

  function onkeydown(e: KeyboardEvent) {
    const step = e.key === "ArrowRight" ? 16 : e.key === "ArrowLeft" ? -16 : 0;
    if (!step) return;
    width = clamp(width + step * direction);
    e.preventDefault();
  }
</script>

<!-- A focusable separator with a value is ARIA's interactive "window splitter" widget. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="resizer"
  role="separator"
  tabindex="0"
  aria-label={label}
  aria-orientation="vertical"
  aria-valuenow={width}
  aria-valuemin={min}
  aria-valuemax={max}
  {onpointerdown}
  {onkeydown}
></div>

<style>
  .resizer {
    flex: 0 0 5px;
    margin: 0 -2px;
    z-index: 1;
    cursor: col-resize;
    touch-action: none;
    background: linear-gradient(var(--border), var(--border)) center / 1px 100% no-repeat;
  }
  .resizer:hover,
  .resizer:focus-visible,
  .resizer:active {
    background: linear-gradient(var(--accent), var(--accent)) center / 2px 100% no-repeat;
    outline: none;
  }
</style>

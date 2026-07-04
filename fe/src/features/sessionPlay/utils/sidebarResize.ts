import type { PointerEvent as ReactPointerEvent } from 'react';

export function startSidebarResize(params: {
  event: ReactPointerEvent<HTMLElement>;
  minWidth: number;
  maxWidth: number;
  setWidth: (width: number) => void;
}): void {
  params.event.preventDefault();

  const maxWidth = Math.min(params.maxWidth, Math.floor(window.innerWidth * 0.65));
  const previousCursor = document.body.style.cursor;
  const previousUserSelect = document.body.style.userSelect;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';

  function handlePointerMove(moveEvent: PointerEvent) {
    const nextWidth = window.innerWidth - moveEvent.clientX;
    params.setWidth(Math.min(maxWidth, Math.max(params.minWidth, nextWidth)));
  }

  function handlePointerUp() {
    document.body.style.cursor = previousCursor;
    document.body.style.userSelect = previousUserSelect;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  }

  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp, { once: true });
}

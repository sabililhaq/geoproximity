export type ListKeyboardItem = { id: string };

export type ListKeyboardHandlers<T extends ListKeyboardItem> = {
  focusedId: string | null;
  onMove: (index: number, ranked: T[]) => void;
  onActivate: (id: string, ranked: T[]) => void;
  onEscape: () => void;
  onRemove: (id: string, neighbour: T | undefined, ranked: T[]) => void;
};

export function handleLocationListKeyboard<T extends ListKeyboardItem>(
  event: KeyboardEvent,
  ranked: T[],
  handlers: ListKeyboardHandlers<T>,
): void {
  // Buttons, disclosure summaries and editors keep their native keyboard behavior.
  if (
    event.target instanceof Element &&
    event.target.closest('button, input, summary, a, textarea, select')
  )
    return;
  const currentIndex = ranked.findIndex((item) => item.id === handlers.focusedId);

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      handlers.onMove(currentIndex + 1, ranked);
      break;
    case 'ArrowUp':
      event.preventDefault();
      handlers.onMove(currentIndex - 1, ranked);
      break;
    case 'Enter':
    case ' ':
      event.preventDefault();
      if (handlers.focusedId) handlers.onActivate(handlers.focusedId, ranked);
      break;
    case 'Escape':
      event.preventDefault();
      handlers.onEscape();
      break;
    case 'Backspace':
    case 'Delete': {
      event.preventDefault();
      if (!handlers.focusedId || currentIndex < 0) return;
      const neighbour = ranked[currentIndex + 1] ?? ranked[currentIndex - 1];
      handlers.onRemove(handlers.focusedId, neighbour, ranked);
      break;
    }
    case 'Home':
      event.preventDefault();
      handlers.onMove(0, ranked);
      break;
    case 'End':
      event.preventDefault();
      handlers.onMove(ranked.length - 1, ranked);
      break;
  }
}

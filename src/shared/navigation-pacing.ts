export const COLLECTION_MOVE_INTERVAL = 300;
export const NAVIGATION_HOLD_INTERVAL = 320;

export function createNavigationGate(interval = COLLECTION_MOVE_INTERVAL) {
  let last = -Infinity;
  return (now: number) => {
    if (now - last < interval) return false;
    last = now;
    return true;
  };
}

export function createNavigationHold<T>(move: (value: T) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let held: T | undefined;
  const stop = () => {
    clearTimeout(timer);
    timer = undefined;
    held = undefined;
  };
  const repeat = () => {
    if (held === undefined) return;
    move(held);
    timer = setTimeout(repeat, NAVIGATION_HOLD_INTERVAL);
  };
  return {
    start(value: T) {
      if (held === value) return;
      stop();
      held = value;
      move(value);
      timer = setTimeout(repeat, NAVIGATION_HOLD_INTERVAL);
    },
    stop(value?: T) {
      if (value === undefined || held === value) stop();
    },
  };
}

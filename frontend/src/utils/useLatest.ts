import { useLayoutEffect, useRef } from 'react';

/**
 * A ref that always holds the latest value, for callbacks and async work that outlive the render
 * they started in. Updated after each commit rather than during render, so a render React throws
 * away never leaks into it.
 */
export function useLatest<T>(value: T): { current: T } {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

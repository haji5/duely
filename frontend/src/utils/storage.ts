/**
 * Web Storage that never throws: reads and writes fail quietly when storage is blocked
 * (privacy modes, disabled site data), so the app keeps working without persistence.
 */
function safe(getStorage: () => Storage) {
  return {
    get(key: string): string | null {
      try {
        return getStorage().getItem(key);
      } catch {
        return null;
      }
    },
    set(key: string, value: string): void {
      try {
        getStorage().setItem(key, value);
      } catch {
        // storage unavailable or full
      }
    },
    remove(key: string): void {
      try {
        getStorage().removeItem(key);
      } catch {
        // storage unavailable
      }
    },
  };
}

export const local = safe(() => window.localStorage);
export const session = safe(() => window.sessionStorage);

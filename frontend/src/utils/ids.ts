/**
 * A random 128-bit hex id. Uses crypto.getRandomValues, which (unlike crypto.randomUUID) also
 * works on plain-http LAN addresses such as http://192.168.1.20:3000.
 */
export function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export class GraphError extends Error {}

export type FieldErrors = Partial<Record<string, string>>;

export function newId(): string {
  const c = globalThis.crypto;
  // randomUUID only exists in secure contexts (https / localhost); fall back for LAN dev access.
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

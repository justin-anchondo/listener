// SPEC 6.3: every read and write of client data names exactly one client.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScopeError";
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Throws unless clientId is a well formed id. Returns it lowercased. */
export function assertClientScope(clientId: unknown): string {
  if (!isUuid(clientId)) throw new ScopeError("missing or malformed client scope");
  return clientId.toLowerCase();
}

/** Throws unless a row loaded for a request belongs to the client the request is scoped to. */
export function assertSameClient(scopeClientId: string, rowClientId: string): void {
  if (scopeClientId.toLowerCase() !== rowClientId.toLowerCase()) {
    throw new ScopeError("row belongs to a different client");
  }
}

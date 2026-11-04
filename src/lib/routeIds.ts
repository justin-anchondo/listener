import { LimitError } from "@/lib/policy/limits";
import { assertClientScope, isUuid } from "@/lib/policy/scope";

/** Validates route ids: the client scope plus any other row ids in the path. */
export function routeIds<K extends string>(params: Record<K | "clientId", string>, ...others: K[]) {
  const out = { clientId: assertClientScope(params.clientId) } as { clientId: string } & Record<K, string>;
  for (const k of others) {
    const v = params[k];
    if (!isUuid(v)) throw new LimitError(k);
    (out as Record<string, string>)[k] = v.toLowerCase();
  }
  return out;
}

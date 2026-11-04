/**
 * Whether an action item owner refers to the Listener owner: "Me", or one of
 * the owner's names from config.yaml (owner.names). Case insensitive, and a
 * full name matches on its first word ("Justin A." matches "Justin").
 */
export function isMine(owner: string | null | undefined, names: string[]): boolean {
  const o = owner?.trim().toLowerCase();
  if (!o) return false;
  if (o === "me") return true;
  const first = o.split(/\s+/)[0].replace(/[^\p{L}\p{N}'-]/gu, "");
  return names.some((n) => {
    const name = n.trim().toLowerCase();
    return !!name && (o === name || first === name || first === name.split(/\s+/)[0]);
  });
}

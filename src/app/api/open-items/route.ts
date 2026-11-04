import { requireSession } from "@/lib/auth/session";
import { listOpenItems } from "@/lib/db/openItems";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

// Cross client by design (SPEC 7). Action item fields only; never sent to a model.
export async function GET() {
  return handle("items.open", async () => {
    await requireSession();
    return json({ items: await listOpenItems() });
  });
}

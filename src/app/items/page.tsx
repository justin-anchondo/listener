import { AppShell } from "@/components/app/app-shell";
import { requirePageSession } from "@/lib/auth/guard";
import { loadConfig } from "@/lib/config";
import OpenItems from "./OpenItems";

export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  await requirePageSession();
  return (
    <AppShell>
      <OpenItems ownerNames={loadConfig().owner.names} onlyMine={loadConfig().assist.only_my_action_items} />
    </AppShell>
  );
}

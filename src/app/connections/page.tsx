import { AppShell } from "@/components/app/app-shell";
import { requirePageSession } from "@/lib/auth/guard";
import Connections from "./Connections";

export const dynamic = "force-dynamic";

/** AI tools connected to Listener, with the address to add and a way to disconnect (SPEC 6.6). */
export default async function ConnectionsPage() {
  await requirePageSession();
  return (
    <AppShell>
      <Connections />
    </AppShell>
  );
}

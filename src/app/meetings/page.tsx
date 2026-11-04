import { AppShell } from "@/components/app/app-shell";
import { requirePageSession } from "@/lib/auth/guard";
import Directory from "./Directory";

export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  await requirePageSession();
  return (
    <AppShell>
      <Directory />
    </AppShell>
  );
}

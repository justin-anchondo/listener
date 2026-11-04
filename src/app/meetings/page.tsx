import { AppShell } from "@/components/app/app-shell";
import { requirePageSession } from "@/lib/auth/guard";
import MeetingsHome from "./MeetingsHome";

export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  await requirePageSession();
  return (
    <AppShell>
      <MeetingsHome />
    </AppShell>
  );
}

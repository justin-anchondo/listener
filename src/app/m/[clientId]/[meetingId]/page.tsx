import { AppShell } from "@/components/app/app-shell";
import { requirePageSession } from "@/lib/auth/guard";
import { loadConfig } from "@/lib/config";
import MeetingView from "./MeetingView";

export const dynamic = "force-dynamic";

export default async function MeetingPage({ params }: { params: Promise<{ clientId: string; meetingId: string }> }) {
  await requirePageSession();
  const { clientId, meetingId } = await params;
  return (
    <AppShell>
      <MeetingView
        clientId={clientId}
        meetingId={meetingId}
        allowedTags={loadConfig().tags}
        ownerNames={loadConfig().owner.names}
        onlyMine={loadConfig().assist.only_my_action_items}
      />
    </AppShell>
  );
}

import { AppShell } from "@/components/app/app-shell";
import { requirePageSession } from "@/lib/auth/guard";
import { loadConfig } from "@/lib/config";
import ProjectMeetings from "./ProjectMeetings";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ clientId: string; projectId: string }> }) {
  await requirePageSession();
  const { clientId, projectId } = await params;
  return (
    <AppShell>
      <ProjectMeetings clientId={clientId} projectId={projectId} maxBriefChars={loadConfig().storage.max_brief_chars} />
    </AppShell>
  );
}

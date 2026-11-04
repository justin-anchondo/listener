import { requirePageSession } from "@/lib/auth/guard";
import ProjectMeetings from "./ProjectMeetings";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ clientId: string; projectId: string }> }) {
  await requirePageSession();
  const { clientId, projectId } = await params;
  return <ProjectMeetings clientId={clientId} projectId={projectId} />;
}

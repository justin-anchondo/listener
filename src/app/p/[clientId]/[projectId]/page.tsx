import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

/** Projects open on their client's page with the project selected. */
export default async function ProjectPage({ params }: { params: Promise<{ clientId: string; projectId: string }> }) {
  await requirePageSession();
  const { clientId, projectId } = await params;
  redirect(`/c/${clientId}?project=${projectId}`);
}

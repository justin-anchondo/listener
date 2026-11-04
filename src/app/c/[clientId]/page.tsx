import { AppShell } from "@/components/app/app-shell";
import { requirePageSession } from "@/lib/auth/guard";
import { loadConfig } from "@/lib/config";
import ClientPage from "./ClientPage";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  await requirePageSession();
  const { clientId } = await params;
  return (
    <AppShell>
      <ClientPage clientId={clientId} logoPixels={loadConfig().storage.logo_pixels} />
    </AppShell>
  );
}

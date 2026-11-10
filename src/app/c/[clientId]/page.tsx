import { AppShell } from "@/components/app/app-shell";
import { requirePageSession } from "@/lib/auth/guard";
import { captureSettings, loadConfig } from "@/lib/config";
import { Suspense } from "react";
import ClientPage from "./ClientPage";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  await requirePageSession();
  const { clientId } = await params;
  return (
    <AppShell>
      <Suspense>
        <ClientPage clientId={clientId} logoPixels={loadConfig().storage.logo_pixels} maxBriefChars={loadConfig().storage.max_brief_chars} voiceSettings={captureSettings(loadConfig())} />
      </Suspense>
    </AppShell>
  );
}

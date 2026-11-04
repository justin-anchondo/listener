import { AppShell } from "@/components/app/app-shell";
import { hasSession } from "@/lib/auth/session";
import { captureSettings, loadConfig } from "@/lib/config";
import { listMeetingTypes } from "@/lib/db/meetingTypes";
import { missingSettings } from "@/lib/setup";
import Capture from "./Capture";
import SetupNeeded from "./SetupNeeded";
import SignIn from "./SignIn";

export const dynamic = "force-dynamic";

export default async function Home() {
  const missing = missingSettings();
  if (missing.length) return <SetupNeeded missing={missing} />;
  if (!(await hasSession())) return <SignIn />;
  const config = loadConfig();
  const types = await listMeetingTypes(config.templates);
  const settings = { ...captureSettings(config), templates: types.map(({ key, name }) => ({ key, name })) };
  return (
    <AppShell>
      <Capture settings={settings} />
    </AppShell>
  );
}

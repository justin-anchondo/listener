import { hasSession } from "@/lib/auth/session";
import { captureSettings, loadConfig } from "@/lib/config";
import { missingSettings } from "@/lib/setup";
import Capture from "./Capture";
import SetupNeeded from "./SetupNeeded";
import SignIn from "./SignIn";

export const dynamic = "force-dynamic";

export default async function Home() {
  const missing = missingSettings();
  if (missing.length) return <SetupNeeded missing={missing} />;
  if (!(await hasSession())) return <SignIn />;
  return <Capture settings={captureSettings(loadConfig())} />;
}

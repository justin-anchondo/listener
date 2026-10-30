import { cookies } from "next/headers";
import { captureSettings, loadConfig } from "@/lib/config";
import { SESSION_COOKIE } from "@/lib/policy/access";
import { hasValidSession } from "@/lib/policy/gate";
import AccessForm from "./AccessForm";
import Capture from "./Capture";

export const dynamic = "force-dynamic";

export default async function Home() {
  const jar = await cookies();
  if (!hasValidSession(jar.get(SESSION_COOKIE)?.value)) return <AccessForm />;
  const config = loadConfig();
  return <Capture settings={captureSettings(config)} />;
}

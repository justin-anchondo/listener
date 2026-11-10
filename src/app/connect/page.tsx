import { hasSession } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { getOAuthClient } from "@/lib/db/connector";
import { cleanAuthorizeRequest } from "@/lib/policy/connector";
import { missingSettings } from "@/lib/setup";
import SetupNeeded from "../SetupNeeded";
import SignIn from "../SignIn";
import ConnectApprove from "./ConnectApprove";

export const dynamic = "force-dynamic";

/**
 * Where Claude sends the owner to approve a connection (SPEC 6.6). Signs in
 * first if needed (the page reloads to here), then asks for Face ID.
 */
export default async function ConnectPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const missing = missingSettings();
  if (missing.length) return <SetupNeeded missing={missing} />;
  if (!loadConfig().connector.enabled) return <Problem text="Connecting AI tools is turned off in config.yaml." />;
  const raw = await searchParams;
  const q = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const client = await getOAuthClient(String(q.client_id ?? ""));
  let host: string;
  try {
    host = new URL(cleanAuthorizeRequest(q, client?.redirectUris ?? null).redirectUri).host;
  } catch {
    return <Problem text="This connection request isn't valid. Start again from the AI tool." />;
  }
  if (!(await hasSession())) return <SignIn />;
  return <ConnectApprove request={q} toolName={client!.name} host={host} />;
}

function Problem({ text }: { text: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-2 px-6">
      <h1 className="text-[22px] font-bold">Can&apos;t connect</h1>
      <p className="text-[15px] text-muted-foreground">{text}</p>
    </main>
  );
}

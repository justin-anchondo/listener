import { requirePageSession } from "@/lib/auth/guard";
import PairApprove from "./PairApprove";

export const dynamic = "force-dynamic";

/** On the signed in phone: approve a computer's sign in code (SPEC 6.1). */
export default async function PairPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  await requirePageSession();
  const { code } = await searchParams;
  return <PairApprove initialCode={typeof code === "string" ? code : ""} />;
}

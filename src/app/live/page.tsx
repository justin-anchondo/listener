import { requirePageSession } from "@/lib/auth/guard";
import { captureSettings, loadConfig } from "@/lib/config";
import LiveFollow from "./LiveFollow";

export const dynamic = "force-dynamic";

/** Desktop view of a meeting being recorded on the phone (SPEC 4.5). */
export default async function LivePage() {
  await requirePageSession();
  const s = captureSettings(loadConfig());
  return <LiveFollow pollSeconds={s.live.follow_poll_seconds} mergeGapSeconds={s.capture.merge_gap_seconds} />;
}

import { AppShell } from "@/components/app/app-shell";
import { ComputerPasskeyOffer } from "@/components/app/computer-passkey-offer";
import { requirePageSession } from "@/lib/auth/guard";
import { captureSettings, loadConfig } from "@/lib/config";
import LiveFollow from "./LiveFollow";

export const dynamic = "force-dynamic";

/** Desktop view of a meeting being recorded on the phone (SPEC 4.5). */
export default async function LivePage() {
  await requirePageSession();
  const s = captureSettings(loadConfig());
  return (
    <AppShell wide>
      <ComputerPasskeyOffer />
      <LiveFollow pollSeconds={s.live.follow_poll_seconds} mergeGapSeconds={s.capture.merge_gap_seconds} silencePromptSeconds={s.capture.silence_prompt_seconds} voiceSettings={s} />
    </AppShell>
  );
}

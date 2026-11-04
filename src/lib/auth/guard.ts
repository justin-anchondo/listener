import { redirect } from "next/navigation";
import { hasSession } from "@/lib/auth/session";
import { missingSettings } from "@/lib/setup";

/** For signed in pages: sends anyone without a session back to the sign in screen. */
export async function requirePageSession(): Promise<void> {
  if (missingSettings().length || !(await hasSession())) redirect("/");
}

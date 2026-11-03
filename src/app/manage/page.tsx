import { redirect } from "next/navigation";
import { hasSession } from "@/lib/auth/session";
import { missingSettings } from "@/lib/setup";
import Manage from "./Manage";

export const dynamic = "force-dynamic";

export default async function ManagePage() {
  if (missingSettings().length || !(await hasSession())) redirect("/");
  return <Manage />;
}

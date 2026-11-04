import { requirePageSession } from "@/lib/auth/guard";
import Manage from "./Manage";

export const dynamic = "force-dynamic";

export default async function ManagePage() {
  await requirePageSession();
  return <Manage />;
}

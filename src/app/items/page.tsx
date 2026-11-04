import { requirePageSession } from "@/lib/auth/guard";
import OpenItems from "./OpenItems";

export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  await requirePageSession();
  return <OpenItems />;
}

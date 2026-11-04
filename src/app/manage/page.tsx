import { redirect } from "next/navigation";

// Managing clients and projects now lives on the Meetings tab.
export default function ManagePage() {
  redirect("/meetings");
}

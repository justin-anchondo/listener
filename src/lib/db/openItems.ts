import { decryptField, unwrapDataKey } from "@/lib/crypto/keys";
import { masterKey } from "@/lib/db/keyring";
import { withDirectory, withOpenItems } from "@/lib/db/scoped";

// Consolidated open items across every client (SPEC 7). Reads only action
// item fields plus client and project names. Never sent to a model.

export type OpenItem = {
  id: string;
  clientId: string;
  clientName: string;
  projectId: string;
  projectName: string;
  meetingId: string | null;
  title: string;
  owner: string | null;
  dueDate: string | null;
  snoozedUntil: string | null;
  createdAt: Date;
};

export async function listOpenItems(): Promise<OpenItem[]> {
  const dir = await withDirectory(async (tx) => ({
    clients: await tx<{ id: string; name_enc: string; wrapped_dek: string }[]>`select id, name_enc, wrapped_dek from clients`,
    projects: await tx<{ id: string; client_id: string; name_enc: string }[]>`select id, client_id, name_enc from projects`,
  }));
  const items = await withOpenItems((tx) => tx<{
    id: string; client_id: string; project_id: string; meeting_id: string | null; title_enc: string; owner_enc: string | null;
    due_date: string | null; snoozed_until: string | null; created_at: Date;
  }[]>`
    select id, client_id, project_id, meeting_id, title_enc, owner_enc,
      to_char(due_date, 'YYYY-MM-DD') as due_date, to_char(snoozed_until, 'YYYY-MM-DD') as snoozed_until, created_at
    from action_items where status = 'open'`);

  const master = masterKey();
  const keys = new Map(dir.clients.map((c) => [c.id, unwrapDataKey(master, c.wrapped_dek, c.id)]));
  const clientName = new Map(dir.clients.map((c) => [c.id, decryptField(keys.get(c.id)!, { clientId: c.id, column: "clients.name", rowId: c.id }, c.name_enc)]));
  const projectName = new Map(dir.projects.map((p) => [p.id, decryptField(keys.get(p.client_id)!, { clientId: p.client_id, column: "projects.name", rowId: p.id }, p.name_enc)]));

  return items
    .filter((i) => keys.has(i.client_id))
    .map((i) => {
      const dek = keys.get(i.client_id)!;
      const ref = (column: string) => ({ clientId: i.client_id, column, rowId: i.id });
      return {
        id: i.id,
        clientId: i.client_id,
        clientName: clientName.get(i.client_id) ?? "",
        projectId: i.project_id,
        projectName: projectName.get(i.project_id) ?? "",
        meetingId: i.meeting_id,
        title: decryptField(dek, ref("action_items.title"), i.title_enc),
        owner: i.owner_enc ? decryptField(dek, ref("action_items.owner"), i.owner_enc) : null,
        dueDate: i.due_date,
        snoozedUntil: i.snoozed_until,
        createdAt: i.created_at,
      };
    })
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.createdAt.getTime() - b.createdAt.getTime());
}

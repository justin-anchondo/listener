import { randomUUID } from "node:crypto";
import { decryptField, encryptField, unwrapDataKey } from "@/lib/crypto/keys";
import { NotFoundError, clientKey, masterKey, newWrappedKey } from "@/lib/db/keyring";
import { withClient, withDirectory } from "@/lib/db/scoped";
import { audit } from "@/lib/db/audit";

export type ProjectSummary = { id: string; name: string; status: "active" | "archived" };
export type ClientSummary = { id: string; name: string; logoVersion: number | null; projects: ProjectSummary[] };

const CLIENT_NAME = "clients.name";
const PROJECT_NAME = "projects.name";
const PROJECT_BRIEF = "projects.brief";

/** All clients and their projects, names decrypted, sorted by name. */
export async function listDirectory(): Promise<ClientSummary[]> {
  const { clients, projects } = await withDirectory(async (tx) => ({
    clients: await tx<{ id: string; name_enc: string; wrapped_dek: string; logo_updated_at: Date | null }[]>`
      select id, name_enc, wrapped_dek, case when logo_enc is null then null else logo_updated_at end as logo_updated_at from clients`,
    projects: await tx<{ id: string; client_id: string; name_enc: string; status: "active" | "archived" }[]>`
      select id, client_id, name_enc, status from projects`,
  }));
  const master = masterKey();
  const out = clients.map((c) => {
    const dek = unwrapDataKey(master, c.wrapped_dek, c.id);
    return {
      id: c.id,
      logoVersion: c.logo_updated_at ? c.logo_updated_at.getTime() : null,
      name: decryptField(dek, { clientId: c.id, column: CLIENT_NAME, rowId: c.id }, c.name_enc),
      projects: projects
        .filter((p) => p.client_id === c.id)
        .map((p) => ({
          id: p.id,
          status: p.status,
          name: decryptField(dek, { clientId: c.id, column: PROJECT_NAME, rowId: p.id }, p.name_enc),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createClient(name: string): Promise<string> {
  const id = randomUUID();
  const { dek, wrapped } = newWrappedKey(id);
  await withClient(id, async (tx) => {
    const nameEnc = encryptField(dek, { clientId: id, column: CLIENT_NAME, rowId: id }, name);
    await tx`insert into clients (id, name_enc, wrapped_dek) values (${id}, ${nameEnc}, ${wrapped})`;
    await audit(tx, "client.created", { clientId: id, objectId: id });
  });
  return id;
}

export async function renameClient(clientId: string, name: string): Promise<void> {
  await withClient(clientId, async (tx, id) => {
    const dek = await clientKey(tx, id);
    const nameEnc = encryptField(dek, { clientId: id, column: CLIENT_NAME, rowId: id }, name);
    await tx`update clients set name_enc = ${nameEnc} where id = ${id}`;
  });
}

/** Deletes the client, its key, and everything under it (SPEC 5). */
export async function deleteClient(clientId: string): Promise<void> {
  await withClient(clientId, async (tx, id) => {
    const rows = await tx`delete from clients where id = ${id} returning id`;
    if (rows.length === 0) throw new NotFoundError("client");
    await audit(tx, "client.deleted", { clientId: id, objectId: id });
  });
}

export async function createProject(clientId: string, name: string): Promise<string> {
  const projectId = randomUUID();
  await withClient(clientId, async (tx, id) => {
    const dek = await clientKey(tx, id);
    const nameEnc = encryptField(dek, { clientId: id, column: PROJECT_NAME, rowId: projectId }, name);
    await tx`insert into projects (id, client_id, name_enc) values (${projectId}, ${id}, ${nameEnc})`;
    await audit(tx, "project.created", { clientId: id, objectId: projectId });
  });
  return projectId;
}

export type ProjectUpdate = { name?: string; brief?: string | null; status?: "active" | "archived" };

export async function updateProject(clientId: string, projectId: string, update: ProjectUpdate): Promise<void> {
  await withClient(clientId, async (tx, id) => {
    const dek = await clientKey(tx, id);
    const ref = (column: string) => ({ clientId: id, column, rowId: projectId });
    const found = await tx`select 1 from projects where id = ${projectId}`;
    if (found.length === 0) throw new NotFoundError("project");
    if (update.name !== undefined) {
      await tx`update projects set name_enc = ${encryptField(dek, ref(PROJECT_NAME), update.name)} where id = ${projectId}`;
    }
    if (update.brief !== undefined) {
      const briefEnc = update.brief === null ? null : encryptField(dek, ref(PROJECT_BRIEF), update.brief);
      await tx`update projects set brief_enc = ${briefEnc} where id = ${projectId}`;
    }
    if (update.status !== undefined) {
      await tx`update projects set status = ${update.status} where id = ${projectId}`;
    }
  });
}

export async function getProjectBrief(clientId: string, projectId: string): Promise<string | null> {
  return withClient(clientId, async (tx, id) => {
    const rows = await tx<{ brief_enc: string | null }[]>`select brief_enc from projects where id = ${projectId}`;
    if (rows.length === 0) throw new NotFoundError("project");
    if (!rows[0].brief_enc) return null;
    const dek = await clientKey(tx, id);
    return decryptField(dek, { clientId: id, column: PROJECT_BRIEF, rowId: projectId }, rows[0].brief_enc);
  });
}

const CLIENT_LOGO = "clients.logo";

/** Stores (or with null, removes) the client's logo, encrypted with its key. */
export async function setClientLogo(clientId: string, logo: { mime: string; base64: string } | null): Promise<void> {
  await withClient(clientId, async (tx, id) => {
    const dek = await clientKey(tx, id);
    const enc = logo ? encryptField(dek, { clientId: id, column: CLIENT_LOGO, rowId: id }, `${logo.mime};${logo.base64}`) : null;
    await tx`update clients set logo_enc = ${enc}, logo_updated_at = ${logo ? new Date() : null} where id = ${id}`;
  });
}

export async function getClientLogo(clientId: string): Promise<{ mime: string; bytes: Buffer } | null> {
  return withClient(clientId, async (tx, id) => {
    const [row] = await tx<{ logo_enc: string | null }[]>`select logo_enc from clients where id = ${id}`;
    if (!row) throw new NotFoundError("client");
    if (!row.logo_enc) return null;
    const dek = await clientKey(tx, id);
    const [mime, base64] = decryptField(dek, { clientId: id, column: CLIENT_LOGO, rowId: id }, row.logo_enc).split(";");
    return { mime, bytes: Buffer.from(base64, "base64") };
  });
}

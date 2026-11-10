import type postgres from "postgres";
import { db } from "@/lib/db/pool";
import { assertClientScope } from "@/lib/policy/scope";

export type Tx = postgres.TransactionSql;

/**
 * Runs fn in a transaction scoped to one client. Row level security in the
 * database only shows and accepts rows for this client (SPEC 6.3).
 */
export async function withClient<T>(clientId: unknown, fn: (tx: Tx, clientId: string) => Promise<T>): Promise<T> {
  const id = assertClientScope(clientId);
  return (await db().begin(async (tx) => {
    await tx`select set_config('search_path', 'listener', true),
      set_config('app.scope', 'client', true), set_config('app.client_id', ${id}, true)`;
    return fn(tx, id);
  })) as T;
}

/** Read only listing of clients and projects for the picker. Names stay encrypted. */
export async function withDirectory<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await db().begin("read only", async (tx) => {
    await tx`select set_config('search_path', 'listener', true), set_config('app.scope', 'directory', true)`;
    return fn(tx);
  })) as T;
}

/** Passkey storage. No client data is visible in this scope. */
export async function withAuth<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await db().begin(async (tx) => {
    await tx`select set_config('search_path', 'listener', true), set_config('app.scope', 'auth', true)`;
    return fn(tx);
  })) as T;
}

/** Consolidated open items (SPEC 7): reads action items across clients and nothing else. */
export async function withOpenItems<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await db().begin("read only", async (tx) => {
    await tx`select set_config('search_path', 'listener', true), set_config('app.scope', 'open_items', true)`;
    return fn(tx);
  })) as T;
}

/** Owner settings that aren't client data, such as meeting types. */
export async function withSettings<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await db().begin(async (tx) => {
    await tx`select set_config('search_path', 'listener', true), set_config('app.scope', 'settings', true)`;
    return fn(tx);
  })) as T;
}

/** Recent meetings across clients (SPEC 6.3): meeting rows and summaries, read only. Never sent to a model. */
export async function withRecent<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await db().begin("read only", async (tx) => {
    await tx`select set_config('search_path', 'listener', true), set_config('app.scope', 'recent', true)`;
    return fn(tx);
  })) as T;
}

/** Cross client counts from security definer functions only (no table is readable in this scope). */
export async function withStats<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await db().begin("read only", async (tx) => {
    await tx`select set_config('search_path', 'listener', true), set_config('app.scope', 'stats', true)`;
    return fn(tx);
  })) as T;
}

/** The Claude connector's OAuth tables only (SPEC 6.6): hashes, no client data. */
export async function withConnector<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await db().begin(async (tx) => {
    await tx`select set_config('search_path', 'listener', true), set_config('app.scope', 'connector', true)`;
    return fn(tx);
  })) as T;
}
